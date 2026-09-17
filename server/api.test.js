import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, request as httpRequest } from 'node:http'
import { createApi } from './api.js'
import { requestModel } from './providers.js'
import { event, streamEvents } from './testFixtures/anthropicStream.js'

const servers = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })))
})
async function start(options = {}) {
  const api = createApi({ env: {}, ...options })
  const server = createServer((req, res) => api(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const origin = `http://127.0.0.1:${server.address().port}`
  const request = (path, init = {}) => fetch(origin + path, init)
  const handshake = async () => {
    const response = await request('/api/session')
    expect(response.status).toBe(200)
    const body = await response.json()
    return { body, headers: { Origin: origin, Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': body.csrfToken, 'Content-Type': 'application/json' } }
  }
  return { request, handshake, origin }
}
const message = { task: 'creative', system: 'Return source.', messages: [{ role: 'user', content: 'A rock' }], max_tokens: 32000 }
const reply = { text: 'function createAsset() {}', provider: 'openai', model: 'gpt-6-astra', requestedModel: 'gpt-6-astra', usage: {}, stopReason: 'completed' }

describe('local API boundary', () => {
  it('allows fifteen minutes for generation and reports expiry as a timeout instead of cancellation', async () => {
    let expire, deadlineMs, began
    const started = new Promise(resolve => { began = resolve })
    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, ms, ...args) => {
      if (ms >= 60 * 1000) { expire = callback; deadlineMs = ms }
      return originalSetTimeout(callback, ms, ...args)
    })
    const app = await start({ requestModel: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      began()
    }) })
    const { headers } = await app.handshake()
    const pending = app.request('/api/message', { method: 'POST', headers, body: JSON.stringify(message) })
    await started
    expect(expire).toBeTypeOf('function')
    expire()
    const response = await pending
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({ code: 'provider_timeout', retryable: false })
    expect(deadlineMs).toBe(15 * 60 * 1000)
  })

  it.each([false, true])('buffers a real HTTP event stream until completion (interrupted=%s)', async interrupted => {
    let finishStream, sawHeaders, providerCalls = 0
    const gate = new Promise(resolve => { finishStream = resolve })
    const headersReceived = new Promise(resolve => { sawHeaders = resolve })
    const complete = { type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'function createAsset() {}' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 } }
    const provider = createServer(async (req, res) => {
      providerCalls++
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      if (body.stream !== true) { res.writeHead(400); res.end(); return }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.flushHeaders()
      res.write(streamEvents(complete).slice(0, 3).map(event).join(''))
      await gate
      res.end(interrupted ? '' : streamEvents(complete).slice(3).map(event).join(''))
    })
    await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
    servers.push(provider)
    const app = await start({ env: { ANTHROPIC_API_KEY: 'synthetic-key' }, requestModel: args => requestModel(args, async (url, options) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages')
      const response = await fetch(`http://127.0.0.1:${provider.address().port}/`, options)
      sawHeaders()
      return response
    }) })
    const { headers } = await app.handshake()
    let clientReceivedResponse = false
    const pending = app.request('/api/message', { method: 'POST', headers, body: JSON.stringify(message) }).then(response => { clientReceivedResponse = true; return response })
    try {
      await headersReceived
      await new Promise(resolve => setImmediate(resolve))
      expect(clientReceivedResponse).toBe(false)
    } finally { finishStream() }
    const response = await pending
    const result = await response.json()
    expect(providerCalls).toBe(1)
    if (interrupted) {
      expect(response.status).toBe(502)
      expect(result).toMatchObject({ code: 'stream_interrupted', retryable: false })
      expect(JSON.stringify(result)).not.toContain('createAsset')
    } else {
      expect(response.status).toBe(200)
      expect(result).toMatchObject({ text: complete.content[0].text, model: complete.model, usage: complete.usage, stopReason: 'end_turn' })
    }
  })

  it('keeps configured keys out of the handshake and uses selected provider server-side', async () => {
    const app = await start({ env: { ANTHROPIC_API_KEY: 'env-private' }, requestModel: async input => {
      expect(input.provider).toBe('openai')
      expect(input.model).toBe('gpt-6-astra')
      expect(input.apiKey).toBe('session-private')
      expect(input.maxTokens).toBe(32000)
      return reply
    } })
    const session = await app.handshake()
    expect(session.body.providers.anthropic.keySource).toBe('environment')
    expect(JSON.stringify(session.body)).not.toContain('env-private')
    const saved = await app.request('/api/settings', { method: 'POST', headers: session.headers, body: JSON.stringify({ provider: 'openai', model: 'gpt-6-astra', apiKey: 'session-private' }) })
    expect(saved.status).toBe(200)
    expect(JSON.stringify(await saved.json())).not.toContain('session-private')
    const generated = await app.request('/api/message', { method: 'POST', headers: session.headers, body: JSON.stringify(message) })
    expect(await generated.json()).toEqual(reply)
  })

  it.each(['foreign-origin', 'wrong-port', 'no-origin', 'null-origin', 'no-cookie', 'bad-csrf'])('rejects %s before spending API tokens', async kind => {
    const app = await start({ requestModel: () => { throw new Error('must not call') } })
    const { headers } = await app.handshake()
    if (kind === 'foreign-origin') headers.Origin = 'https://evil.example'
    if (kind === 'wrong-port') headers.Origin = 'http://127.0.0.1:1'
    if (kind === 'no-origin') delete headers.Origin
    if (kind === 'null-origin') headers.Origin = 'null'
    if (kind === 'no-cookie') delete headers.Cookie
    if (kind === 'bad-csrf') headers['X-CSRF-Token'] = 'bad'
    const response = await app.request('/api/message', { method: 'POST', headers, body: JSON.stringify(message) })
    expect([401, 403]).toContain(response.status)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects a rebinding Host header (native fetch silently replaces this header)', async () => {
    const app = await start()
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(app.origin + '/api/session', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode) })
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(403)
  })

  it('rejects cross-site handshakes, including opaque origins', async () => {
    const app = await start()
    expect((await app.request('/api/session', { headers: { Origin: 'null' } })).status).toBe(403)
    expect((await app.request('/api/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
  })

  it('isolates session keys and forgets them without removing server environment configuration', async () => {
    const app = await start({ env: { OPENAI_API_KEY: 'env-private' } })
    const one = await app.handshake()
    const two = await app.handshake()
    await app.request('/api/settings', { method: 'POST', headers: one.headers, body: JSON.stringify({ provider: 'openai', apiKey: 'session-private' }) })
    const independent = await app.request('/api/session', { headers: two.headers })
    expect((await independent.json()).providers.openai.keySource).toBe('environment')
    const forgotten = await app.request('/api/settings', { method: 'POST', headers: one.headers, body: JSON.stringify({ provider: 'openai', forgetKey: true }) })
    expect((await forgotten.json()).providers.openai.keySource).toBe('environment')
  })

  it('expires idle sessions without reviving old credentials', async () => {
    let time = 1000
    const app = await start({ now: () => time })
    const session = await app.handshake()
    time += 3_600_001
    const response = await app.request('/api/settings', { method: 'POST', headers: session.headers, body: JSON.stringify({ provider: 'openai' }) })
    expect(response.status).toBe(401)
  })

  it.each([
    [{ ...message, task: 'unknown' }, 400],
    [{ ...message, max_tokens: 99999999 }, 400],
    [{ ...message, messages: [{ role: 'system', content: 'injected' }] }, 400],
    [{ ...message, system: 'x'.repeat(2 * 1024 * 1024) }, 413]
  ])('bounds input before calling providers', async (body, status) => {
    const app = await start()
    const { headers } = await app.handshake()
    expect((await app.request('/api/message', { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(status)
  })

  it('does not echo unexpected errors or credentials into responses', async () => {
    const app = await start({ env: { OPENAI_API_KEY: 'private', LLM_PROVIDER: 'openai' }, requestModel: async () => { throw new Error('private') } })
    const { headers } = await app.handshake()
    const response = await app.request('/api/message', { method: 'POST', headers, body: JSON.stringify(message) })
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private')
  })

  it('cancels upstream work when the browser disconnects and rejects concurrent generation', async () => {
    let began
    let aborted
    const started = new Promise(resolve => { began = resolve })
    const stopped = new Promise(resolve => { aborted = resolve })
    const app = await start({ env: { ANTHROPIC_API_KEY: 'test' }, requestModel: async ({ signal }) => {
      began()
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted(); reject(new DOMException('Aborted', 'AbortError')) }, { once: true }))
    } })
    const { headers } = await app.handshake()
    const controller = new AbortController()
    const first = app.request('/api/message', { method: 'POST', headers, body: JSON.stringify(message), signal: controller.signal }).catch(e => e)
    await started
    expect((await app.request('/api/message', { method: 'POST', headers, body: JSON.stringify(message) })).status).toBe(409)
    controller.abort()
    await stopped
    expect((await first).name).toBe('AbortError')
  })

  it('supports explicitly allowed local companion origins, not wildcard CORS', async () => {
    const app = await start({ env: { LLM_ALLOWED_ORIGINS: 'http://localhost:5274' } })
    const response = await app.request('/api/session', { headers: { Origin: 'http://localhost:5274' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5274')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })
})
