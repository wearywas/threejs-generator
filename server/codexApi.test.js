import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApi } from './api.js'
import { ModelError } from './providers.js'

const origin = 'http://127.0.0.1:5173'
const companion = 'http://127.0.0.1:5274'
const message = { task: 'creative', system: 'Return source.', messages: [{ role: 'user', content: 'A rock' }] }
const connected = { state: 'connected', message: 'ChatGPT authentication detected.', models: [{ id: 'gpt-6-astra', name: 'Astra' }], defaultModel: 'gpt-6-astra' }
const reply = { text: 'function createAsset() {}', provider: 'codex', requestedModel: 'gpt-6-astra', model: 'gpt-6-astra', usage: { inputTokens: 10, outputTokens: 20 }, stopReason: 'completed' }
const publicReply = { ...reply, usage: { input_tokens: 10, output_tokens: 20 } }
const apps = []

function setup(env = { THREEJS_EXPERIMENTAL_CODEX: '1' }) {
  let cached = { state: 'not_connected', message: 'Codex is not connected.', models: [], defaultModel: null }
  const adapter = {
    status: vi.fn(() => cached),
    connect: vi.fn(async () => { cached = connected; return cached }),
    login: vi.fn(async () => ({ ...cached, authUrl: 'https://auth.openai.com/authorize?state=synthetic' })),
    generate: vi.fn(async () => reply), cancel: vi.fn(), close: vi.fn(async () => {})
  }
  const factory = vi.fn(() => adapter)
  const requestModel = vi.fn(async () => ({ ...reply, provider: 'openai' }))
  const api = createApi({ env, requestModel, createCodexAdapter: factory })
  // In-memory HTTP boundary: no sockets, child processes, environment files or accounts.
  function begin(path, { method = 'GET', headers = {}, body, raw } = {}) {
    const req = Object.assign(new EventEmitter(), { url: path, method, socket: { localPort: 5173 }, headers: { host: '127.0.0.1:5173', ...headers } })
    const res = Object.assign(new EventEmitter(), { headers: {}, writableEnded: false, destroyed: false,
      setHeader(name, value) { this.headers[name.toLowerCase()] = value },
      writeHead(status, values = {}) { this.status = status; Object.entries(values).forEach(([name, value]) => this.setHeader(name, value)) },
      end(value) { this.body = value ? JSON.parse(value) : undefined; this.writableEnded = true }
    })
    const done = api(req, res).then(() => res)
    queueMicrotask(() => { req.emit('data', Buffer.from(raw ?? JSON.stringify(body ?? {}))); req.emit('end') })
    return { req, res, done }
  }
  const request = (path, options) => begin(path, options).done
  async function session(headers) {
    const result = await request('/api/session', { headers })
    expect(result.status).toBe(200)
    return { body: result.body, headers: { origin, cookie: result.headers['set-cookie'].split(';')[0], 'x-csrf-token': result.body.csrfToken, 'content-type': 'application/json' } }
  }
  const post = (path, session, body = {}, headers = {}) => request(path, { method: 'POST', headers: { ...session.headers, ...headers }, body })
  async function select(session) {
    expect((await post('/api/codex/connect', session)).status).toBe(200)
    expect((await post('/api/settings', session, { provider: 'codex' })).status).toBe(200)
  }
  const app = { api, adapter, factory, requestModel, begin, request, session, post, select, setStatus: value => { cached = value } }
  apps.push(app)
  return app
}

afterEach(async () => {
  for (const app of apps.splice(0)) {
    // All tests except the explicit BYOK regression require zero paid-provider calls.
    if (!app.byok) expect(app.requestModel).not.toHaveBeenCalled()
    await app.api.close?.().catch(() => {})
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('experimental Codex API boundary', () => {
  it.each([undefined, '0', 'true'])('does not construct or expose Codex for flag %s', async flag => {
    const app = setup({ THREEJS_EXPERIMENTAL_CODEX: flag })
    const session = await app.session()
    expect(app.factory).not.toHaveBeenCalled()
    expect(session.body.providers).not.toHaveProperty('codex')
    for (const path of ['/api/codex/connect', '/api/codex/login']) {
      expect((await app.request(path)).status).toBe(404)
      expect((await app.post(path, session)).status).toBe(404)
    }
    expect((await app.post('/api/settings', session, { provider: 'codex' })).body.code).toBe('invalid_provider')
  })

  it('exposes cached allowlisted Codex status on the ordinary no-Origin own-app GET without connecting', async () => {
    const env = { THREEJS_EXPERIMENTAL_CODEX: '1', THREEJS_CODEX_EXECUTABLE: 'C:/trusted/codex.exe' }
    const app = setup(env)
    app.setStatus({ ...connected, account: 'private-account', config: { secret: true }, models: [{ ...connected.models[0], private: true }] })
    const session = await app.session()
    expect(app.factory).toHaveBeenCalledExactlyOnceWith({ executable: 'C:/trusted/codex.exe', env })
    expect(session.body.providers.codex).toEqual({ model: 'gpt-6-astra', modelOverride: '', connection: connected })
    expect(app.adapter.connect).not.toHaveBeenCalled()
    expect(app.adapter.login).not.toHaveBeenCalled()
    expect(app.adapter.generate).not.toHaveBeenCalled()
    expect((await app.post('/api/codex/connect', session, { executable: 'C:/untrusted.exe', args: ['unsafe'] })).body.session.providers.codex.connection).toEqual(connected)
    expect(app.adapter.connect).toHaveBeenCalledExactlyOnceWith()
  })

  it('rejects cross-site no-Origin session discovery and no-Origin Codex selection or generation', async () => {
    const app = setup()
    expect((await app.request('/api/session', { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    const session = await app.session({ 'sec-fetch-site': 'same-origin' })
    expect(session.body.providers.codex.connection.state).toBe('not_connected')
    expect((await app.post('/api/settings', session, { provider: 'codex' }, { origin: undefined })).status).toBe(403)
    await app.select(session)
    expect((await app.post('/api/message', session, message, { origin: undefined })).status).toBe(403)
    expect(app.adapter.generate).not.toHaveBeenCalled()
  })

  it.each(['connect', 'login'])('requires explicit POST for %s', async action => {
    const app = setup()
    const session = await app.session()
    expect((await app.request(`/api/codex/${action}`, { headers: session.headers })).status).toBe(405)
    expect(app.adapter[action]).not.toHaveBeenCalled()
    expect((await app.post(`/api/codex/${action}`, session)).status).toBe(200)
    expect(app.adapter[action]).toHaveBeenCalledExactlyOnceWith()
  })

  it.each(['connect', 'login'])('protects %s with Host, own Origin, session, CSRF and JSON validation', async action => {
    const app = setup({ THREEJS_EXPERIMENTAL_CODEX: '1', LLM_ALLOWED_ORIGINS: companion })
    const session = await app.session()
    for (const [headers, status, code] of [
      [{ host: 'evil.example:5173' }, 403, 'invalid_host'],
      [{ host: '127.0.0.1:5174' }, 403, 'invalid_host'],
      [{ origin: companion, 'x-csrf-token': 'bad' }, 403, 'invalid_origin'],
      [{ origin: undefined }, 403, 'invalid_origin'],
      [{ origin: 'null' }, 403, 'invalid_origin'],
      [{ cookie: undefined }, 401, 'session_expired'],
      [{ 'x-csrf-token': 'bad' }, 403, 'invalid_csrf'],
      [{ 'content-type': 'text/plain' }, 415, 'content_type']
    ]) {
      const result = await app.post(`/api/codex/${action}`, session, {}, headers)
      expect(result.status).toBe(status)
      expect(result.body.code).toBe(code)
    }
    expect((await app.post(`/api/codex/${action}`, session, [])).body.code).toBe('invalid_request')
    expect((await app.request(`/api/codex/${action}`, { method: 'OPTIONS', headers: { origin: companion } })).status).toBe(403)
    expect(app.adapter[action]).not.toHaveBeenCalled()
  })

  it('hides Codex from companion sessions and rejects companion selection or use of a selected Codex session', async () => {
    const app = setup({ THREEJS_EXPERIMENTAL_CODEX: '1', LLM_ALLOWED_ORIGINS: companion })
    const other = await app.session({ origin: companion })
    expect(other.body.providers).not.toHaveProperty('codex')
    expect((await app.post('/api/settings', other, { provider: 'codex' }, { origin: companion })).body.code).toBe('invalid_origin')
    const own = await app.session()
    await app.select(own)
    for (const path of ['/api/session', '/api/message', '/api/generate', '/api/settings']) {
      const result = await app.request(path, { method: path === '/api/session' ? 'GET' : 'POST', headers: { ...own.headers, origin: companion }, body: { ...message, prompt: 'rock', provider: 'openai' } })
      expect(result.status).toBe(403)
      expect(result.body.code).toBe('invalid_origin')
    }
    expect(app.adapter.generate).not.toHaveBeenCalled()
  })

  it('retains explicitly allowed companion BYOK paths and budgets', async () => {
    const app = setup({ THREEJS_EXPERIMENTAL_CODEX: '1', LLM_ALLOWED_ORIGINS: companion })
    app.byok = true
    const session = await app.session({ origin: companion })
    expect((await app.post('/api/settings', session, { provider: 'openai', model: 'custom', apiKey: 'synthetic' }, { origin: companion })).status).toBe(200)
    const result = await app.post('/api/message', session, { ...message, task: 'edit' }, { origin: companion })
    expect(result.status).toBe(200)
    expect(result.headers['access-control-allow-origin']).toBe(companion)
    expect(app.requestModel).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai', model: 'custom', apiKey: 'synthetic', maxTokens: 16384 }))
    expect(app.adapter.generate).not.toHaveBeenCalled()
  })

  it('accepts only cached catalog models or blank and rejects all key fields without changing selection', async () => {
    const app = setup()
    const session = await app.session()
    await app.post('/api/codex/connect', session)
    for (const fields of [{ model: 'unknown' }, { apiKey: 'synthetic' }, { apiKey: null }, { forgetKey: false }, { forgetKey: true }]) {
      expect((await app.post('/api/settings', session, { provider: 'codex', ...fields })).status).toBe(400)
      expect((await app.request('/api/session', { headers: session.headers })).body.provider).toBe('anthropic')
    }
    expect((await app.post('/api/settings', session, { provider: 'codex', model: 'gpt-6-astra' })).body.providers.codex.modelOverride).toBe('gpt-6-astra')
    expect((await app.post('/api/settings', session, { provider: 'codex', model: '' })).body.providers.codex.modelOverride).toBe('')
  })

  it('does not substitute a model when the catalog has no advertised default', async () => {
    const app = setup()
    const session = await app.session()
    app.setStatus({ ...connected, models: [{ id: 'other', name: 'Other' }], defaultModel: null })
    expect((await app.post('/api/settings', session, { provider: 'codex', model: '' })).body.providers.codex.model).toBe('')
    expect((await app.post('/api/message', session, message)).body.code).toBe('invalid_model')
    expect(app.adapter.generate).not.toHaveBeenCalled()
    expect((await app.post('/api/settings', session, { provider: 'codex', model: 'other' })).status).toBe(200)
    expect((await app.post('/api/message', session, message)).status).toBe(200)
    expect(app.adapter.generate.mock.calls[0][0].model).toBe('other')
  })

  it.each(['creative', 'convert'])('routes %s with opaque session ownership and no provider options', async task => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    const result = await app.post('/api/message', session, { ...message, task, owner: 'guessed-owner', executable: 'untrusted', max_tokens: 100 })
    expect(result.status).toBe(200)
    expect(result.body).toEqual(publicReply)
    const args = app.adapter.generate.mock.calls[0][0]
    expect(args).toEqual({ owner: session.headers.cookie.slice('threejs_session='.length), task, model: 'gpt-6-astra', system: message.system, messages: message.messages, signal: expect.any(AbortSignal) })
  })

  it('normalizes the source endpoint without exposing extra adapter metadata', async () => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    app.adapter.generate.mockResolvedValue({ ...reply, text: '```js\nfunction createAsset() {}\n```', account: 'private' })
    const result = await app.post('/api/generate', session, { prompt: 'A rock' })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ success: true, code: 'function createAsset() {}', provider: 'codex', model: 'gpt-6-astra' })
    expect(result.body).not.toHaveProperty('account')
    expect(app.adapter.generate.mock.calls[0][0]).toMatchObject({ task: 'creative', messages: message.messages })
  })

  it('returns only normalized terminal response fields and public usage on the message endpoint', async () => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    app.adapter.generate.mockResolvedValue({ ...reply, account: 'private', usage: { ...reply.usage, private: 'raw', totalTokens: -1 } })
    expect((await app.post('/api/message', session, message)).body).toEqual(publicReply)
    app.adapter.generate.mockResolvedValue({ ...reply, usage: undefined })
    expect((await app.post('/api/message', session, message)).body).not.toHaveProperty('usage')
  })

  it('normalizes reported token counts, preserving zero and omitting unknown or invalid counts', async () => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    app.adapter.generate.mockResolvedValue({ ...reply, usage: {
      inputTokens: 12, outputTokens: 5, totalTokens: 17, cachedInputTokens: 0,
      cacheWriteInputTokens: null, reasoningOutputTokens: -1, private: 'hidden',
    } })
    expect((await app.post('/api/message', session, message)).body.usage).toEqual({
      input_tokens: 12, output_tokens: 5, total_tokens: 17, cached_input_tokens: 0,
    })
    app.adapter.generate.mockResolvedValue({ ...reply, usage: { inputTokens: null, outputTokens: '5' } })
    expect((await app.post('/api/message', session, message)).body).not.toHaveProperty('usage')
  })

  it.each(['spec', 'test'])('rejects unsupported %s before any adapter or provider invocation', async task => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    expect((await app.post('/api/message', session, { ...message, task })).body.code).toBe('unsupported_task')
    expect(app.adapter.generate).not.toHaveBeenCalled()
  })

  it.each(['edit', 'animate'])('routes %s to Codex even with environment API keys available', async task => {
    const app = setup({ THREEJS_EXPERIMENTAL_CODEX: '1', OPENAI_API_KEY: 'synthetic', ANTHROPIC_API_KEY: 'synthetic' })
    const session = await app.session()
    await app.select(session)
    const edited = JSON.stringify({ code: 'function createAsset() {}', schema: null, textureSlots: null, changes: 'Updated' })
    app.adapter.generate.mockResolvedValue({ ...reply, text: edited })
    const result = await app.post('/api/message', session, { ...message, task })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ provider: 'codex', text: edited })
    expect(app.adapter.generate.mock.calls[0][0].task).toBe(task)
  })

  it.each(['http://auth.openai.com/a', 'https://evil.example/a', 'https://auth.openai.com.evil.example/a', 'https://user:pass@auth.openai.com/a', 'https://auth.openai.com/a#secret', 'https://auth.openai.com/a#', 'https://auth.openai.com:444/a', 'javascript:alert(1)'])('rejects unsafe managed login URL %s without echoing it', async authUrl => {
    const app = setup()
    const session = await app.session()
    app.adapter.login.mockResolvedValue({ ...connected, authUrl })
    const result = await app.post('/api/codex/login', session)
    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ code: 'invalid_response', retryable: false })
    expect(JSON.stringify(result.body)).not.toContain(authUrl)
  })

  it.each(['auth.openai.com', 'auth0.openai.com'])('returns validated managed login URL on %s with normal session status', async host => {
    const app = setup()
    const session = await app.session()
    const authUrl = `https://${host}/authorize?state=synthetic`
    app.adapter.login.mockResolvedValue({ ...connected, authUrl, account: 'private' })
    const result = await app.post('/api/codex/login', session)
    expect(result.body).toEqual({ session: session.body, authUrl })
  })

  it('does not start managed login when the cached account uses an API key', async () => {
    const app = setup()
    const session = await app.session()
    app.setStatus({ ...connected, state: 'api_key', models: [], defaultModel: null })
    expect((await app.post('/api/codex/login', session)).body.code).toBe('authentication_error')
    expect(app.adapter.login).not.toHaveBeenCalled()
  })

  it('accepts completed login without requiring or exposing another sign-in link', async () => {
    const app = setup()
    const session = await app.session()
    app.adapter.login.mockImplementation(async () => { app.setStatus(connected); return connected })
    const result = await app.post('/api/codex/login', session)
    expect(result.status).toBe(200)
    expect(result.body.session.providers.codex.connection.state).toBe('connected')
    expect(result.body).not.toHaveProperty('authUrl')
  })

  it.each(['connect', 'login'])('preserves sanitized %s errors and releases only the requesting session', async action => {
    const app = setup()
    const session = await app.session()
    app.adapter[action].mockRejectedValueOnce(new ModelError('codex_busy', 'Another Codex operation is active.', 409))
    const busy = await app.post(`/api/codex/${action}`, session)
    expect(busy.status).toBe(409)
    expect(busy.body).toMatchObject({ code: 'codex_busy', retryable: false })
    app.adapter[action].mockRejectedValueOnce(new Error('private account detail'))
    const failed = await app.post(`/api/codex/${action}`, session)
    expect(failed.status).toBe(500)
    expect(JSON.stringify(failed.body)).not.toContain('private account')
    expect((await app.post('/api/settings', session, { provider: 'openai' })).status).toBe(200)
  })

  it.each([
    [{ ...message, task: 'unknown' }, 'invalid_task'],
    [{ ...message, max_tokens: 32001 }, 'invalid_budget'],
    [{ ...message, messages: [{ role: 'system', content: 'bad' }] }, 'invalid_messages'],
    [{ ...message, system: 'x'.repeat(2 * 1024 * 1024) }, 'body_too_large']
  ])('rejects invalid Codex inputs without attempting a turn', async (body, code) => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    expect((await app.post('/api/message', session, body)).body.code).toBe(code)
    expect(app.adapter.generate).not.toHaveBeenCalled()
  })

  it.each([new ModelError('codex_busy', 'Another Codex operation is active.', 409), new ModelError('codex_policy', 'Policy could not be verified.', 503), new Error('private raw upstream detail')])('never falls back after generation failure: %s', async error => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    app.adapter.generate.mockRejectedValue(error)
    const result = await app.post('/api/message', session, message)
    expect(result.status).toBe(error instanceof ModelError ? error.status : 500)
    expect(result.body.retryable).toBe(false)
    expect(JSON.stringify(result.body)).not.toContain('private raw')
    expect(result.body).not.toHaveProperty('text')
    expect((await app.request('/api/session', { headers: session.headers })).body.provider).toBe('codex')
  })

  it('blocks same-session settings/connect/login during generation and isolates disconnect cancellation', async () => {
    const app = setup()
    const one = await app.session()
    const two = await app.session()
    await app.select(one)
    await app.select(two)
    let started
    const ready = new Promise(resolve => { started = resolve })
    let ownedSignal
    app.adapter.generate.mockImplementationOnce(({ signal }) => new Promise((resolve, reject) => {
      ownedSignal = signal
      signal.addEventListener('abort', () => reject(new ModelError('cancelled', 'Cancelled.', 499)), { once: true })
      started()
    })).mockRejectedValue(new ModelError('codex_busy', 'Another Codex operation is active.', 409))
    const pending = app.begin('/api/message', { method: 'POST', headers: one.headers, body: message })
    await ready
    for (const path of ['/api/codex/connect', '/api/codex/login', '/api/settings', '/api/message']) {
      expect((await app.post(path, one, path === '/api/message' ? message : { provider: 'openai' })).status).toBe(409)
    }
    const other = app.begin('/api/message', { method: 'POST', headers: two.headers, body: { ...message, owner: one.headers.cookie } })
    expect((await other.done).status).toBe(409)
    other.res.emit('close')
    expect(ownedSignal.aborted).toBe(false)
    expect((await app.post('/api/codex/cancel', two, { owner: one.headers.cookie })).status).toBe(404)
    expect(app.adapter.cancel).not.toHaveBeenCalled()
    pending.res.emit('close')
    expect(ownedSignal.aborted).toBe(true)
    expect((await pending.done).body.code).toBe('cancelled')
  })

  it('reserves the requesting session during explicit connection actions', async () => {
    const app = setup()
    const session = await app.session()
    let complete, started
    const ready = new Promise(resolve => { started = resolve })
    app.adapter.connect.mockImplementation(() => new Promise(resolve => { complete = resolve; started() }))
    const pending = app.post('/api/codex/connect', session)
    await ready
    expect((await app.post('/api/settings', session, { provider: 'openai' })).status).toBe(409)
    expect((await app.post('/api/codex/login', session)).status).toBe(409)
    complete(connected)
    expect((await pending).status).toBe(200)
  })

  it('reports the 15-minute deadline with interrupted allowance usage even if the adapter rejects as cancelled', async () => {
    vi.useFakeTimers()
    const app = setup()
    const session = await app.session()
    await app.select(session)
    let started
    const ready = new Promise(resolve => { started = resolve })
    app.adapter.generate.mockImplementation(({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new ModelError('cancelled', 'Cancelled.', 499)), { once: true })
      started()
    }))
    const pending = app.post('/api/message', session, message)
    await ready
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
    const result = await pending
    expect(result.status).toBe(504)
    expect(result.body.code).toBe('provider_timeout')
    expect(result.body.error).toMatch(/interrupt.*allowance|allowance.*interrupt/i)
    expect(result.body.error).not.toMatch(/API charges/i)
  })

  it('does not claim the full deadline elapsed for an earlier adapter timeout', async () => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    app.adapter.generate.mockRejectedValue(new ModelError('provider_timeout', 'The Codex operation timed out.', 504))
    const result = await app.post('/api/message', session, message)
    expect(result.status).toBe(504)
    expect(result.body).toMatchObject({ code: 'provider_timeout', retryable: false })
    expect(result.body.error).toMatch(/allowance/)
    expect(result.body.error).not.toMatch(/15-minute/)
  })

  it('closes idempotently, aborts active owned work first, and rejects new work', async () => {
    const app = setup()
    const session = await app.session()
    await app.select(session)
    let started, signal
    const ready = new Promise(resolve => { started = resolve })
    app.adapter.generate.mockImplementation(input => new Promise((resolve, reject) => {
      signal = input.signal
      signal.addEventListener('abort', () => reject(new ModelError('cancelled', 'Cancelled.', 499)), { once: true })
      started()
    }))
    app.adapter.close.mockImplementation(async () => { expect(signal.aborted).toBe(true) })
    const pending = app.post('/api/message', session, message)
    await ready
    const first = app.api.close()
    expect(app.api.close()).toBe(first)
    await first
    expect((await pending).body.code).toBe('cancelled')
    expect(app.adapter.close).toHaveBeenCalledTimes(1)
    expect((await app.post('/api/codex/connect', session)).status).toBe(503)
  })

  it('sanitizes asynchronous shutdown failures without losing the rejection', async () => {
    const app = setup()
    app.adapter.close.mockRejectedValue(new Error('private process stderr'))
    await expect(app.api.close()).rejects.toMatchObject({ code: 'codex_shutdown_failed', status: 503 })
    await expect(app.api.close()).rejects.not.toThrow('private process stderr')
    expect(app.adapter.close).toHaveBeenCalledTimes(1)
  })
})
