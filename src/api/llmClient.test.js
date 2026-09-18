import { describe, expect, it } from 'vitest'
import { createLlmClient } from './llmClient.js'

const session = { csrfToken: 'csrf-test', provider: 'openai', providers: { openai: { model: 'gpt-6-astra', keySource: null } } }
describe('browser model transport', () => {
  it('keeps request history and confirmation intact when a connection response has no valid session', async () => {
    const client = createLlmClient(async url => {
      if (url === '/api/session') return Response.json(session)
      if (url === '/api/message') return Response.json({ text: 'source', provider: 'openai', model: 'model-test', usage: { output_tokens: 3 } })
      return Response.json({ session: { provider: 'codex' } })
    })
    await client.createMessage({ task: 'creative' })
    const previous = client.getSnapshot()
    await expect(client.connectCodex()).rejects.toMatchObject({ message: 'The local API returned an invalid session. Restart the local server.', retryable: false })
    expect(client.getSnapshot()).toBe(previous)
    expect(client.getSnapshot()).toMatchObject({ provider: 'openai', pending: 0, requiresConfirmation: false, lastResponse: { provider: 'openai', model: 'model-test' } })
  })
  it('discards a late response on cancellation with Codex allowance wording', async () => {
    let release, started
    const ready = new Promise(resolve => { started = resolve })
    const client = createLlmClient(async url => {
      if (url === '/api/session') return Response.json({ ...session, provider: 'codex' })
      started()
      return new Promise(resolve => { release = () => resolve(Response.json({ text: 'late source', provider: 'codex' })) })
    })
    const result = client.createMessage({ task: 'creative' }).catch(error => error)
    await ready
    client.cancelRequests()
    release()
    expect(await result).toMatchObject({ name: 'AbortError', retryable: false, message: 'Generation cancelled. Codex allowance already used is not refundable.' })
    expect(client.getSnapshot()).toMatchObject({ pending: 0, lastResponse: null })
  })
  it('publishes saved provider and availability on explicit connection actions without model requests', async () => {
    const calls = []
    const codex = { model: 'gpt-6-astra', modelOverride: '', connection: { state: 'signed_out', models: [], defaultModel: '' } }
    const enabled = { ...session, providers: { ...session.providers, codex } }
    const client = createLlmClient(async (url, options) => {
      calls.push({ url, options })
      if (url === '/api/session') return Response.json(enabled)
      if (url === '/api/settings') return Response.json({ ...enabled, provider: 'codex' })
      return Response.json({ session: enabled, ...(url.endsWith('/login') ? { authUrl: 'https://auth.openai.com/authorize?state=synthetic' } : {}) })
    })
    let updates = 0
    client.subscribe(() => updates++)
    await client.getSession()
    expect(client.getSnapshot()).toMatchObject({ provider: 'openai', codexAvailable: true, pending: 0, lastResponse: null })
    await client.connectCodex()
    const login = await client.loginCodex()
    expect(login.authUrl).toBe('https://auth.openai.com/authorize?state=synthetic')
    expect(calls.map(call => call.url)).toEqual(['/api/session', '/api/codex/connect', '/api/codex/login'])
    for (const { options } of calls.slice(1)) {
      expect(options.method).toBe('POST')
      expect(options.headers['X-CSRF-Token']).toBe('csrf-test')
      expect(JSON.parse(options.body)).toEqual({})
    }
    await client.saveSettings({ provider: 'codex', model: 'gpt-6-astra' })
    expect(client.getSnapshot()).toMatchObject({ provider: 'codex', requiresConfirmation: false, pending: 0 })
    expect(updates).toBe(4)
    expect(JSON.stringify(client.getSnapshot())).not.toMatch(/authUrl|csrf|authorize/)
  })

  it.each(['codex', 'openai'])('captures %s at request start for cancellation despite later settings changes', async provider => {
    let started
    const ready = new Promise(resolve => { started = resolve })
    const client = createLlmClient(async (url, options) => {
      if (url === '/api/session') return Response.json({ ...session, provider })
      if (url === '/api/settings') return Response.json({ ...session, provider: provider === 'codex' ? 'openai' : 'codex' })
      started()
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    })
    const result = client.createMessage({ task: 'creative' }).catch(error => error)
    await ready
    await client.saveSettings({ provider: provider === 'codex' ? 'openai' : 'codex' })
    client.cancelRequests()
    const error = await result
    expect(error).toMatchObject({ name: 'AbortError', retryable: false, code: 'cancelled' })
    expect(error.message).toMatch(provider === 'codex' ? /Codex allowance already used is not refundable/ : /provider may still charge/)
    expect(client.getSnapshot().pending).toBe(0)
  })

  it('does not clear session confirmation after connecting or signing in', async () => {
    const client = createLlmClient(async url => {
      if (url === '/api/session') return Response.json(session)
      if (url === '/api/message') return Response.json({ code: 'session_expired', error: 'Expired' }, { status: 401 })
      return Response.json({ session })
    })
    await expect(client.createMessage({ task: 'creative' })).rejects.toMatchObject({ code: 'session_expired' })
    await client.connectCodex()
    await client.loginCodex()
    expect(client.getSnapshot().requiresConfirmation).toBe(true)
  })
  it('cancels a generation waiting for a handshake without cancelling a settings subscriber', async () => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const client = createLlmClient(async url => {
      if (url !== '/api/session') throw new Error('Cancelled generation must not reach the provider')
      await gate
      return Response.json(session)
    })
    const settings = client.getSession()
    const result = client.createMessage({ task: 'creative' }).catch(error => error)
    client.cancelRequests()
    // A turn of the event loop must be enough; the handshake is still unresolved.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(client.getSnapshot().pending).toBe(0)
    expect(await result).toMatchObject({ name: 'AbortError', retryable: false })
    release()
    expect((await settings).csrfToken).toBe('csrf-test')
  })
  it('blocks generation after expiry until the user confirms settings again', async () => {
    let messages = 0
    let sessions = 0
    let renewed = false
    const client = createLlmClient(async url => {
      if (url === '/api/session') { sessions++; return Response.json(renewed ? { ...session, provider: 'anthropic' } : session) }
      if (url === '/api/settings') { renewed = true; return Response.json({ ...session, provider: 'openai' }) }
      messages++
      if (!renewed) return Response.json({ code: 'session_expired', error: 'Session expired.' }, { status: 401 })
      return Response.json({ text: 'source', provider: 'openai' })
    })
    await expect(client.createMessage({ task: 'creative' })).rejects.toMatchObject({ code: 'session_expired' })
    await expect(client.createMessage({ task: 'creative' })).rejects.toMatchObject({ code: 'session_expired' })
    expect(messages).toBe(1)
    expect(sessions).toBe(1)
    expect(client.getSnapshot().requiresConfirmation).toBe(true)
    await client.getSession()
    await expect(client.createMessage({ task: 'creative' })).rejects.toMatchObject({ code: 'session_expired' })
    await client.saveSettings({ provider: 'openai', model: 'custom-model' })
    expect((await client.createMessage({ task: 'creative' })).provider).toBe('openai')
    expect(client.getSnapshot().requiresConfirmation).toBe(false)
  })
  it('shares simultaneous handshakes so the cookie and CSRF token cannot race', async () => {
    let handshakes = 0
    let release
    const gate = new Promise(resolve => { release = resolve })
    const client = createLlmClient(async url => {
      if (url === '/api/session') { handshakes++; await gate; return Response.json(session) }
      return Response.json({ text: 'source' })
    })
    const settings = client.getSession()
    const generation = client.createMessage({ task: 'creative' })
    release()
    await Promise.all([settings, generation])
    expect(handshakes).toBe(1)
  })
  it('uses a local session token and sends requests only to the local API', async () => {
    const visited = []
    const client = createLlmClient(async (url, options) => {
      visited.push(url)
      expect(options.credentials).toBe('same-origin')
      if (url === '/api/session') return Response.json(session)
      expect(options.headers['X-CSRF-Token']).toBe('csrf-test')
      expect(JSON.parse(options.body).task).toBe('creative')
      return Response.json({ text: 'source', model: 'gpt-6-astra', provider: 'openai', usage: { output_tokens: 17 } })
    })
    const result = await client.createMessage({ task: 'creative', messages: [], max_tokens: 32000 })
    expect(result.content).toEqual([{ type: 'text', text: 'source' }])
    expect(client.getSnapshot().lastResponse.model).toBe('gpt-6-astra')
    expect(visited).toEqual(['/api/session', '/api/message'])
  })

  it('surfaces incomplete output without retrying or handing partial code to consumers', async () => {
    let requests = 0
    const client = createLlmClient(async url => {
      if (url === '/api/session') return Response.json(session)
      requests++
      return Response.json({ code: 'incomplete_output', error: 'No partial code was executed.', retryable: false }, { status: 502 })
    })
    await expect(client.createMessage({ task: 'creative' })).rejects.toMatchObject({ code: 'incomplete_output', retryable: false })
    expect(requests).toBe(1)
    expect(client.getSnapshot().lastResponse).toBeNull()
    expect(client.getSnapshot().pending).toBe(0)
  })

  it('does not retain submitted keys in client snapshots', async () => {
    const client = createLlmClient(async url => Response.json(session))
    await client.saveSettings({ provider: 'openai', apiKey: 'temporary-private' })
    expect(JSON.stringify(client.getSnapshot())).not.toContain('temporary-private')
    expect(JSON.stringify(await client.getSession())).not.toContain('temporary-private')
  })

  it('aborts an active fetch and reports non-retryable cancellation', async () => {
    let started
    const ready = new Promise(resolve => { started = resolve })
    const client = createLlmClient(async (url, options) => {
      if (url === '/api/session') return Response.json(session)
      started()
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    })
    const result = client.createMessage({ task: 'creative' })
    await ready
    client.cancelRequests()
    await expect(result).rejects.toMatchObject({ name: 'AbortError', retryable: false })
    expect(client.getSnapshot().pending).toBe(0)
  })
})
