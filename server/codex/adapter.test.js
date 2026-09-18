import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCodexAdapter } from './adapter.js'
import { auditedVersion, safeConfig, modelCatalog } from './testFixtures.js'

const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const input = { owner: 'session-a', task: 'creative', model: 'gpt-6-astra', system: 'Return asset source.', messages: [{ role: 'user', content: 'A tree' }] }
const adapters = []
const finalizers = []

function setup(options = {}) {
  const listeners = new Map()
  const calls = []
  const handlers = {}
  let threadNumber = 0
  let cwdNumber = 0
  let account = { account: { type: 'chatgpt', email: 'private@example.test', planType: 'pro' }, requiresOpenaiAuth: true }
  let config = safeConfig()
  let catalog = modelCatalog()
  const emit = (name, data) => { for (const callback of listeners.get(name) || []) callback(data) }
  const rpc = {
    request: vi.fn(async (method, params) => {
      calls.push({ method, params })
      if (handlers[method]) return handlers[method](params)
      if (method === 'account/read') return account
      if (method === 'config/read') return { config, origins: {} }
      if (method === 'model/list') return catalog
      if (method === 'hooks/list') return { data: [{ cwd: params.cwds[0], hooks: [], errors: [], warnings: [] }] }
      if (method === 'mcpServerStatus/list') return { data: [], nextCursor: null }
      if (method === 'thread/start') return { thread: { id: `thread-${++threadNumber}`, ephemeral: true, modelProvider: 'openai' },
        model: params.model, modelProvider: 'openai', cwd: params.cwd, instructionSources: [], approvalPolicy: 'never', sandbox: { type: 'readOnly', networkAccess: false } }
      if (method === 'turn/start') return { turn: { id: `turn-${threadNumber}`, status: 'inProgress', items: [] } }
      if (method === 'turn/interrupt') return {}
      if (method === 'account/login/start') return { type: 'chatgpt', loginId: 'login-1', authUrl: 'https://auth.openai.com/oauth/authorize?state=opaque' }
      throw new Error(`unexpected request ${method}`)
    }),
    onNotification(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(callback)
      return () => listeners.get(name)?.delete(callback)
    },
    close: vi.fn(() => { emit('transport/closed', { code: 'connection_error' }); emit('transport/exited', {}); return Promise.resolve() })
  }
  const rpcFactory = vi.fn(() => rpc)
  const probeVersion = vi.fn(async () => auditedVersion)
  const directories = { ensureProfile: vi.fn(async () => {}), create: vi.fn(async () => `C:/empty-${++cwdNumber}`), remove: vi.fn(async () => {}) }
  const adapter = createCodexAdapter({ executable: 'C:/trusted/codex.exe', env: { LOCALAPPDATA: 'C:/appdata', OPENAI_API_KEY: 'secret', CODEX_HOME: 'C:/normal' },
    rpcFactory, probeVersion, directories, ...options })
  adapters.push(adapter)
  finalizers.push(() => emit('transport/exited', {}))
  const complete = (text = 'function createAsset() {}', status = 'completed', ids = {}) => emit('turn/completed', {
    threadId: ids.threadId || `thread-${threadNumber}`, turn: { id: ids.turnId || `turn-${threadNumber}`, status, error: null,
      items: [{ id: 'final', type: 'agentMessage', phase: 'final_answer', text }] }
  })
  return { adapter, rpc, rpcFactory, probeVersion, directories, handlers, calls, emit, complete,
    setAccount: value => { account = value }, setConfig: value => { config = value }, setCatalog: value => { catalog = value } }
}

afterEach(async () => {
  finalizers.splice(0).forEach(finalize => finalize())
  for (const adapter of adapters.splice(0)) await adapter.close()
  vi.useRealTimers()
})

describe('private adapter connection and login', () => {
  it.each(['0.155.0-alpha.2.6', '0.155.0-alpha.9.2'])('keeps status inert and refreshes the healthy child on %s', async version => {
    const probeVersion = vi.fn(async () => version)
    const ctx = setup({ probeVersion })
    expect(ctx.adapter.status()).toEqual({ state: 'not_connected', message: expect.any(String), models: [], defaultModel: null })
    expect(ctx.rpcFactory).not.toHaveBeenCalled()
    expect(probeVersion).not.toHaveBeenCalled()
    const status = await ctx.adapter.connect()
    expect(status).toEqual({ state: 'connected', message: expect.any(String), models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }], defaultModel: 'gpt-6-astra' })
    expect(JSON.stringify(status)).not.toContain('private@example.test')
    const publicCopy = ctx.adapter.status()
    publicCopy.models[0].id = 'tampered'
    expect(ctx.adapter.status().models[0].id).toBe('gpt-6-astra')
    await ctx.adapter.connect()
    expect(ctx.rpcFactory).toHaveBeenCalledTimes(1)
    expect(probeVersion).toHaveBeenCalledTimes(1)
    expect(ctx.rpc.close).not.toHaveBeenCalled()
    const launch = ctx.rpcFactory.mock.calls[0][0]
    expect(launch.cwd).toBe('C:/empty-1')
    expect(launch.env.CODEX_HOME.replaceAll('\\', '/')).toBe('C:/appdata/ThreeJSGenerator/codex-profile-experimental')
    expect(launch.env.OPENAI_API_KEY).toBeUndefined()
  })

  it('reports missing/unknown runtimes without starting app-server', async () => {
    const missing = setup({ executable: '' })
    expect((await missing.adapter.connect()).state).toBe('missing')
    expect(missing.rpcFactory).not.toHaveBeenCalled()
    const unknown = setup({ probeVersion: async () => '0.155.0-alpha.2.7' })
    expect((await unknown.adapter.connect()).state).toBe('incompatible')
    expect(unknown.rpcFactory).not.toHaveBeenCalled()
  })

  it('requires explicit model selection when the preferred model is absent', async () => {
    const ctx = setup()
    const catalog = modelCatalog()
    catalog.data[0].model = 'another-model'
    ctx.setCatalog(catalog)
    expect((await ctx.adapter.connect()).defaultModel).toBeNull()
    await expect(ctx.adapter.generate({ ...input, model: '' })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(ctx.calls.some(call => call.method === 'turn/start')).toBe(false)
  })

  it('starts only managed ChatGPT login, refreshes matching completion, and preserves login on connect', async () => {
    const ctx = setup()
    ctx.setAccount({ account: null, requiresOpenaiAuth: true })
    expect((await ctx.adapter.connect()).state).toBe('signed_out')
    const login = await ctx.adapter.login()
    expect(login.authUrl).toBe('https://auth.openai.com/oauth/authorize?state=opaque')
    expect(ctx.calls.find(call => call.method === 'account/login/start').params).toEqual({ type: 'chatgpt' })
    await ctx.adapter.connect()
    expect(ctx.rpc.close).not.toHaveBeenCalled()
    ctx.setAccount({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true })
    ctx.emit('account/login/completed', { loginId: 'unrelated', success: true })
    await tick()
    expect(ctx.adapter.status().state).toBe('signed_out')
    ctx.emit('account/login/completed', { loginId: 'login-1', success: true })
    await tick()
    expect(ctx.adapter.status().state).toBe('connected')
  })

  it('never switches API-key authentication and rechecks it before login', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    ctx.setAccount({ account: { type: 'apiKey' }, requiresOpenaiAuth: true })
    await expect(ctx.adapter.login()).rejects.toMatchObject({ code: 'authentication_error' })
    expect(ctx.adapter.status().state).toBe('api_key')
    expect(ctx.calls.some(call => call.method === 'account/login/start')).toBe(false)
  })

  it('never returns an unsafe login URL or raw RPC failures', async () => {
    const ctx = setup()
    ctx.setAccount({ account: null, requiresOpenaiAuth: true })
    await ctx.adapter.connect()
    ctx.handlers['account/login/start'] = () => ({ type: 'chatgpt', loginId: 'login-1', authUrl: 'https://evil.test/?token=secret' })
    const error = await ctx.adapter.login().catch(error => error)
    expect(error).toMatchObject({ code: 'codex_policy', retryable: false })
    expect(error.message).not.toContain('secret')
  })

  it('resumes a pending validated login after refresh without exposing its URL in status', async () => {
    const ctx = setup()
    ctx.setAccount({ account: null, requiresOpenaiAuth: true })
    await ctx.adapter.connect()
    const first = await ctx.adapter.login()
    expect(await ctx.adapter.connect()).not.toHaveProperty('authUrl')
    expect(ctx.adapter.status()).not.toHaveProperty('authUrl')
    await expect(ctx.adapter.login()).resolves.toMatchObject({ authUrl: first.authUrl })
    await expect(ctx.adapter.login()).resolves.toMatchObject({ authUrl: first.authUrl })
    expect(ctx.calls.filter(call => call.method === 'account/login/start')).toHaveLength(1)
    await expect(ctx.adapter.generate(input)).rejects.toMatchObject({ code: 'codex_busy' })
  })

  it.each(['before-account', 'after-account'])('does not restart login when completion races inspection %s', async phase => {
    const ctx = setup()
    ctx.setAccount({ account: null, requiresOpenaiAuth: true })
    await ctx.adapter.connect()
    await ctx.adapter.login()
    const accountRead = deferred()
    ctx.handlers['account/read'] = () => accountRead.promise
    const resumed = ctx.adapter.login()
    await tick()
    const authenticated = { account: { type: 'chatgpt' }, requiresOpenaiAuth: true }
    ctx.setAccount(authenticated)
    if (phase === 'after-account') {
      // The in-flight read captured signed-out state before completion arrived.
      accountRead.resolve({ account: null, requiresOpenaiAuth: true })
    }
    ctx.emit('account/login/completed', { loginId: 'login-1', success: true })
    delete ctx.handlers['account/read']
    if (phase === 'before-account') accountRead.resolve(authenticated)
    const result = await resumed
    await tick()
    expect(result.state).toBe('connected')
    expect(result).not.toHaveProperty('authUrl')
    expect(ctx.calls.filter(call => call.method === 'account/login/start')).toHaveLength(1)
    const generation = ctx.adapter.generate(input)
    await tick()
    ctx.complete()
    await expect(generation).resolves.toMatchObject({ provider: 'codex' })
  })

  it('treats login on an already authenticated connection as an inert success', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const result = await ctx.adapter.login()
    expect(result.state).toBe('connected')
    expect(result).not.toHaveProperty('authUrl')
    expect(ctx.calls.some(call => call.method === 'account/login/start')).toBe(false)
  })

  it.each(['api_key', 'policy'])('rechecks %s before resuming a pending login', async gate => {
    const ctx = setup()
    ctx.setAccount({ account: null, requiresOpenaiAuth: true })
    await ctx.adapter.connect()
    await ctx.adapter.login()
    if (gate === 'api_key') ctx.setAccount({ account: { type: 'apiKey' }, requiresOpenaiAuth: true })
    else ctx.setConfig({ ...safeConfig(), approval_policy: 'on-request' })
    await expect(ctx.adapter.login()).rejects.toMatchObject({ code: gate === 'api_key' ? 'authentication_error' : 'codex_policy' })
    expect(ctx.calls.filter(call => call.method === 'account/login/start')).toHaveLength(1)
  })

  it.each(['success', 'failure', 'disconnect'])('forgets the pending login URL after %s', async terminal => {
    const ctx = setup()
    ctx.setAccount({ account: null, requiresOpenaiAuth: true })
    await ctx.adapter.connect()
    const first = await ctx.adapter.login()
    if (terminal === 'disconnect') ctx.emit('transport/closed', { code: 'connection_error' })
    else ctx.emit('account/login/completed', { loginId: 'login-1', success: terminal === 'success' })
    await tick()
    await ctx.adapter.connect()
    ctx.handlers['account/login/start'] = () => ({ type: 'chatgpt', loginId: 'login-2', authUrl: 'https://auth.openai.com/authorize?state=new-synthetic' })
    const next = await ctx.adapter.login()
    expect(next.authUrl).not.toBe(first.authUrl)
    expect(ctx.calls.filter(call => call.method === 'account/login/start')).toHaveLength(2)
  })

  it('handles login completion arriving before its start response', async () => {
    const ctx = setup()
    ctx.setAccount({ account: null, requiresOpenaiAuth: true })
    await ctx.adapter.connect()
    ctx.handlers['account/login/start'] = () => {
      ctx.setAccount({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true })
      ctx.emit('account/login/completed', { loginId: 'early', success: true })
      return { type: 'chatgpt', loginId: 'early', authUrl: 'https://auth.openai.com/oauth/authorize?state=opaque' }
    }
    await ctx.adapter.login()
    await tick()
    expect(ctx.adapter.status().state).toBe('connected')
  })

  it('bounds connect to 30000ms, closes its child and removes all timers', async () => {
    vi.useFakeTimers()
    const ctx = setup()
    ctx.handlers['config/read'] = () => new Promise(() => {})
    const connecting = ctx.adapter.connect()
    await tick()
    await vi.advanceTimersByTimeAsync(30000)
    expect((await connecting).state).toBe('unavailable')
    expect(ctx.rpc.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a hung connect and aborts its owned version probe on close', async () => {
    vi.useFakeTimers()
    const probe = deferred()
    let signal
    const ctx = setup({ probeVersion: options => {
      signal = options.signal
      signal.addEventListener('abort', () => options.onExit(), { once: true })
      return probe.promise
    } })
    const connecting = ctx.adapter.connect()
    await tick()
    await ctx.adapter.close()
    expect(signal.aborted).toBe(true)
    expect((await connecting).state).toBe('not_connected')
    probe.resolve(auditedVersion)
    await tick()
    expect(ctx.rpcFactory).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not initialize profile or process resources after immediate close', async () => {
    const ctx = setup()
    const connecting = ctx.adapter.connect()
    await ctx.adapter.close()
    await connecting
    expect(ctx.directories.ensureProfile).not.toHaveBeenCalled()
    expect(ctx.probeVersion).not.toHaveBeenCalled()
  })
})

describe('single-owner isolated generation', () => {
  it.each([null, 12, { ...input, messages: [null] }, { ...input, signal: {} }])('sanitizes malformed input without reserving ownership: %j', async malformed => {
    const ctx = setup()
    await ctx.adapter.connect()
    let rejected
    expect(() => { rejected = ctx.adapter.generate(malformed) }).not.toThrow()
    await expect(rejected).rejects.toMatchObject({ name: 'ModelError', code: 'invalid_request', retryable: false })
    const generated = ctx.adapter.generate(input)
    await tick()
    ctx.complete()
    await expect(generated).resolves.toMatchObject({ stopReason: 'completed' })
  })

  it('releases ownership and sanitizes errors if signal setup throws after reservation', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const controller = new AbortController()
    controller.signal.addEventListener = () => { throw new Error('private setup failure') }
    let rejected
    expect(() => { rejected = ctx.adapter.generate({ ...input, signal: controller.signal }) }).not.toThrow()
    await expect(rejected).rejects.toMatchObject({ code: 'invalid_request', retryable: false })
    const generated = ctx.adapter.generate(input)
    await tick()
    ctx.complete()
    await expect(generated).resolves.toMatchObject({ stopReason: 'completed' })
  })
  it('enforces one global active operation even across separate adapter instances', async () => {
    const one = setup()
    const two = setup()
    await one.adapter.connect()
    await expect(two.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    const first = one.adapter.generate(input)
    await expect(two.adapter.generate({ ...input, owner: 'session-b' })).rejects.toMatchObject({ code: 'codex_busy' })
    expect(two.adapter.cancel('session-a')).toBe(false)
    await tick()
    one.complete()
    await first
    await one.adapter.close()
    await expect(two.adapter.connect()).resolves.toMatchObject({ state: 'connected' })
  })

  it.each(['connect', 'login'])('holds the shared profile lease throughout pending %s inspection', async method => {
    const one = setup()
    const two = setup()
    if (method === 'login') await one.adapter.connect()
    const hold = deferred()
    one.handlers['config/read'] = () => hold.promise
    const control = one.adapter[method]()
    await tick()
    await expect(two.adapter.generate(input)).rejects.toMatchObject({ code: 'codex_busy' })
    await expect(two.adapter.login()).rejects.toMatchObject({ code: 'codex_busy' })
    await expect(two.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    hold.resolve({ config: safeConfig() })
    await control
  })

  it('holds the shared profile lease through managed login and blocks control behind generation', async () => {
    const one = setup()
    const two = setup()
    await one.adapter.connect()
    const generated = one.adapter.generate(input)
    await tick()
    await expect(two.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    await expect(two.adapter.login()).rejects.toMatchObject({ code: 'codex_busy' })
    one.complete()
    await generated
    one.setAccount({ account: null, requiresOpenaiAuth: true })
    await one.adapter.login()
    await expect(two.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    await expect(two.adapter.login()).rejects.toMatchObject({ code: 'codex_busy' })
    await expect(two.adapter.generate(input)).rejects.toMatchObject({ code: 'codex_busy' })
    await one.adapter.connect()
    expect(one.rpc.close).not.toHaveBeenCalled()
  })

  it('blocks generation until a pending login has completed', async () => {
    const ctx = setup()
    ctx.setAccount({ account: null, requiresOpenaiAuth: true })
    await ctx.adapter.connect()
    await ctx.adapter.login()
    await expect(ctx.adapter.generate(input)).rejects.toMatchObject({ code: 'codex_busy' })
    expect(ctx.calls.some(call => call.method === 'turn/start')).toBe(false)
  })
  it('rejects unsafe config before hook/MCP enumeration or thread creation', async () => {
    const ctx = setup()
    const config = safeConfig()
    config.mcp_servers = { unexpected: { enabled: true } }
    ctx.setConfig(config)
    expect((await ctx.adapter.connect()).state).toBe('incompatible')
    expect(ctx.calls.map(call => call.method)).toEqual(['config/read'])
  })
  it('requires prior connection and reserves ownership before asynchronous preflight', async () => {
    const ctx = setup()
    await expect(ctx.adapter.generate(input)).rejects.toMatchObject({ code: 'codex_not_connected' })
    await ctx.adapter.connect()
    const hold = deferred()
    ctx.handlers['config/read'] = () => hold.promise
    const first = ctx.adapter.generate(input).catch(error => error)
    await expect(ctx.adapter.generate({ ...input, owner: 'session-b' })).rejects.toMatchObject({ code: 'codex_busy' })
    await expect(ctx.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    await expect(ctx.adapter.login()).rejects.toMatchObject({ code: 'codex_busy' })
    expect(ctx.adapter.cancel('session-b')).toBe(false)
    expect(ctx.adapter.cancel('session-a')).toBe(true)
    hold.resolve({ config: safeConfig() })
    expect(await first).toMatchObject({ code: 'cancelled' })
    await tick()
    expect(ctx.calls.some(call => call.method === 'turn/start')).toBe(false)
  })

  it.each(['spec', 'repair', undefined])('rejects unsupported task %s before any turn or preflight', async task => {
    const ctx = setup()
    await ctx.adapter.connect()
    const count = ctx.calls.length
    await expect(ctx.adapter.generate({ ...input, task })).rejects.toMatchObject({ code: 'invalid_request', retryable: false })
    expect(ctx.calls.length).toBe(count)
  })

  it('sends ephemeral no-environment text-only turns and returns only terminal final_answer', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate(input)
    let settled = false
    generated.then(() => { settled = true })
    await tick()
    const thread = ctx.calls.find(call => call.method === 'thread/start').params
    expect(thread).toMatchObject({ model: 'gpt-6-astra', modelProvider: 'openai', ephemeral: true, allowProviderModelFallback: false,
      approvalPolicy: 'never', sandbox: 'read-only', environments: [], dynamicTools: [], selectedCapabilityRoots: [], cwd: 'C:/empty-2' })
    expect(thread.developerInstructions).toBe(input.system)
    const turn = ctx.calls.find(call => call.method === 'turn/start').params
    expect(turn).toMatchObject({ threadId: 'thread-1', environments: [], input: [{ type: 'text', text: 'A tree', text_elements: [] }] })
    expect(turn).not.toHaveProperty('effort')
    ctx.emit('item/completed', { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'comment', phase: 'commentary', text: 'Do not return' } })
    ctx.emit('item/completed', { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'final', phase: 'final_answer', text: 'function createAsset() {}' } })
    await tick()
    expect(settled).toBe(false)
    ctx.complete()
    await expect(generated).resolves.toEqual({ text: 'function createAsset() {}', provider: 'codex', requestedModel: 'gpt-6-astra', model: 'gpt-6-astra', stopReason: 'completed' })
    expect(ctx.directories.remove).toHaveBeenCalledWith('C:/empty-2')
  })

  it('normalizes fixed structured conversion transport to the existing dynamic code/schema parser', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate({ ...input, task: 'convert' })
    await tick()
    const schema = ctx.calls.find(call => call.method === 'turn/start').params.outputSchema
    expect(schema).toEqual({ type: 'object', additionalProperties: false, required: ['code', 'schemaJson'], properties: { code: { type: 'string' }, schemaJson: { type: 'string' } } })
    expect(ctx.calls.find(call => call.method === 'thread/start').params.developerInstructions).toContain('schemaJson')
    ctx.complete(JSON.stringify({ code: 'function createAsset() {}', schemaJson: JSON.stringify({ size: { type: 'number', default: 1 } }) }))
    expect(JSON.parse((await generated).text).schema.size.default).toBe(1)
    const invalid = ctx.adapter.generate({ ...input, task: 'convert' }).catch(error => error)
    await tick()
    ctx.complete('{"code":"x","parameterSchema":{}}')
    expect(await invalid).toMatchObject({ code: 'invalid_response' })
  })

  it.each(['not JSON', 'null', '[]', '"string"'])('rejects invalid dynamic conversion schema %s', async schemaJson => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate({ ...input, task: 'convert' }).catch(error => error)
    await tick()
    ctx.complete(JSON.stringify({ code: 'function createAsset() {}', schemaJson }))
    expect(await generated).toMatchObject({ code: 'invalid_response' })
  })

  it.each(['{}', 'null'])('returns completed edits with optional schema %s and texture definitions intact', async schemaJson => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate({ ...input, task: 'edit' }).catch(error => error)
    await tick()
    const turn = ctx.calls.find(call => call.method === 'turn/start')?.params
    expect(turn?.outputSchema.required).toEqual(['code', 'schemaJson', 'textureSlotsJson', 'changes'])
    expect(turn.outputSchema.additionalProperties).toBe(false)
    const slots = [{ id: 'wood', label: 'Wood', description: 'Optional wood texture' }]
    ctx.complete(JSON.stringify({ code: 'function createAsset() {}', schemaJson, textureSlotsJson: JSON.stringify(slots), changes: 'Added texture support' }))
    expect(JSON.parse((await generated).text)).toEqual({ code: 'function createAsset() {}', schema: JSON.parse(schemaJson), textureSlots: slots, changes: 'Added texture support' })
  })

  it.each([
    { schemaJson: '[]' }, { schemaJson: 'invalid' }, { textureSlotsJson: '{}' },
    { textureSlotsJson: '[null]' }, { textureSlotsJson: '[{"id":1,"label":"bad"}]' },
    { changes: null }, { code: ' ' },
  ])('rejects malformed edit transport without partial code: %j', async patch => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate({ ...input, task: 'edit' }).catch(error => error)
    await tick()
    ctx.complete(JSON.stringify({ code: 'function createAsset() {}', schemaJson: 'null', textureSlotsJson: 'null', changes: 'Edited', ...patch }))
    expect(await generated).toMatchObject({ code: 'invalid_response', retryable: false })
  })

  it('returns animation source, controls and description through fixed transport', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate({ ...input, task: 'animate' }).catch(error => error)
    await tick()
    const turn = ctx.calls.find(call => call.method === 'turn/start')?.params
    expect(turn?.outputSchema.required).toEqual(['code', 'schemaJson', 'animationDescription'])
    expect(turn.sandboxPolicy).toEqual({ type: 'readOnly', networkAccess: false })
    const schema = { speed: { type: 'number', default: 1 } }
    ctx.complete(JSON.stringify({ code: 'function createAsset() {}', schemaJson: JSON.stringify(schema), animationDescription: 'Gentle rotation' }))
    expect(JSON.parse((await generated).text)).toEqual({ code: 'function createAsset() {}', schema, animationDescription: 'Gentle rotation' })
  })

  it.each(['null', '[]', 'not JSON'])('rejects malformed animation controls: %s', async schemaJson => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate({ ...input, task: 'animate' }).catch(error => error)
    await tick()
    ctx.complete(JSON.stringify({ code: 'function createAsset() {}', schemaJson, animationDescription: 'Rotation' }))
    expect(await generated).toMatchObject({ code: 'invalid_response', retryable: false })
  })

  it.each(['creative', 'edit', 'animate'].flatMap(task => ['failed', 'interrupted', 'refused', 'inProgress'].map(status => [task, status])))('never uses %s final text from terminal status %s', async (task, status) => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate({ ...input, task }).catch(error => error)
    await tick()
    ctx.complete('partial secret', status)
    expect(await generated).toMatchObject({ retryable: false })
    expect((await generated).message).not.toContain('partial secret')
  })

  it('rejects no-final, oversized-final, and prohibited capability output', async () => {
    for (const item of [{ type: 'agentMessage', phase: 'commentary', text: 'not final' },
      { type: 'agentMessage', phase: 'final_answer', text: 'x'.repeat(500001) },
      { type: 'commandExecution', command: 'secret' }]) {
      const ctx = setup()
      await ctx.adapter.connect()
      const generated = ctx.adapter.generate(input).catch(error => error)
      await tick()
      ctx.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', items: [{ id: 'item', ...item }] } })
      expect(await generated).toMatchObject({ retryable: false })
      await ctx.adapter.close()
    }
  })

  it('rechecks policy, account and available models and authenticates again immediately before turn start', async () => {
    for (const change of ['policy', 'auth', 'model', 'late-auth']) {
      const ctx = setup()
      await ctx.adapter.connect()
      if (change === 'policy') { const config = safeConfig(); config.features.image_generation = true; ctx.setConfig(config) }
      if (change === 'auth') ctx.setAccount({ account: { type: 'apiKey' }, requiresOpenaiAuth: true })
      if (change === 'model') ctx.setCatalog({ data: [], nextCursor: null })
      if (change === 'late-auth') ctx.handlers['thread/start'] = params => {
        ctx.setAccount({ account: null, requiresOpenaiAuth: true })
        return { thread: { id: 'thread-1', ephemeral: true, modelProvider: 'openai' }, model: params.model, modelProvider: 'openai', cwd: params.cwd,
          instructionSources: [], sandbox: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never' }
      }
      await expect(ctx.adapter.generate(input)).rejects.toMatchObject({ retryable: false })
      expect(ctx.calls.some(call => call.method === 'turn/start')).toBe(false)
      await ctx.adapter.close()
    }
  })

  it('ignores mismatched and late notifications across turns and only reports actual tokens', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const first = ctx.adapter.generate(input)
    await tick()
    ctx.emit('thread/tokenUsage/updated', { threadId: 'other', turnId: 'turn-1', tokenUsage: { total: { inputTokens: 999 } } })
    ctx.emit('thread/tokenUsage/updated', { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: { total: { inputTokens: 12, outputTokens: 5, totalTokens: 17, cachedInputTokens: 2, reasoningOutputTokens: 1 } } })
    ctx.complete()
    const result = await first
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5, totalTokens: 17, cachedInputTokens: 2, reasoningOutputTokens: 1 })
    const next = ctx.adapter.generate(input)
    await tick()
    ctx.complete('late secret', 'completed', { threadId: 'thread-1', turnId: 'turn-1' })
    ctx.complete('new source')
    expect((await next).text).toBe('new source')
  })

  it('handles final notifications arriving before the turn/start response', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    ctx.handlers['turn/start'] = () => {
      ctx.complete('early source')
      return { turn: { id: 'turn-1', status: 'inProgress', items: [] } }
    }
    expect((await ctx.adapter.generate(input)).text).toBe('early source')
  })

  it.each([{ status: 'failed', error: { message: 'raw secret' } }, { status: 'unknown' }])('rejects a failed or unknown turn/start response', async turn => {
    const ctx = setup()
    await ctx.adapter.connect()
    ctx.handlers['turn/start'] = () => ({ turn: { id: 'turn-1', items: [], ...turn } })
    await expect(ctx.adapter.generate(input)).rejects.toMatchObject({ retryable: false })
  })

  it('allows isolated Code Mode/clock result notifications without returning their output', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate(input)
    await tick()
    ctx.emit('item/completed', { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'clock', type: 'functionCallOutput', name: 'curr_time', namespace: 'clock', output: 'not source' } })
    ctx.complete('final source')
    expect((await generated).text).toBe('final source')
  })
})

describe('cancellation, deadlines and owned cleanup', () => {
  it('holds the profile lease until an aborted version probe confirms exit', async () => {
    const exiting = deferred()
    const probe = deferred()
    let exited
    const one = setup({ probeVersion: options => {
      exited = options.onExit
      options.onShutdown(() => exiting.promise)
      return probe.promise
    } })
    const two = setup()
    const connecting = one.adapter.connect()
    await tick()
    let settled = false
    const closing = one.adapter.close().then(() => { settled = true })
    await tick()
    expect(settled).toBe(false)
    await expect(two.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    exited()
    exiting.resolve()
    await closing
    await connecting
    probe.resolve(auditedVersion)
    await tick()
    expect(one.rpcFactory).not.toHaveBeenCalled()
    await expect(two.adapter.connect()).resolves.toMatchObject({ state: 'connected' })
  })
  it('retains the lease and awaits a delayed owned-child exit during close', async () => {
    const one = setup()
    const two = setup()
    await one.adapter.connect()
    const exiting = deferred()
    one.rpc.close.mockImplementation(() => exiting.promise)
    let settled = false
    const closing = one.adapter.close().then(() => { settled = true })
    await tick()
    expect(settled).toBe(false)
    await expect(two.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    expect(one.directories.remove).not.toHaveBeenCalledWith('C:/empty-1')
    exiting.resolve()
    await closing
    await expect(two.adapter.connect()).resolves.toMatchObject({ state: 'connected' })
  })

  it('reports failed shutdown, retains ownership until actual exit, and allows explicit close retry', async () => {
    const one = setup()
    const two = setup()
    await one.adapter.connect()
    one.rpc.close.mockRejectedValueOnce(new Error('raw kill error'))
    await expect(one.adapter.close()).rejects.toMatchObject({ code: 'codex_shutdown_failed', retryable: false })
    expect(one.adapter.status()).toMatchObject({ state: 'unavailable', message: expect.stringContaining('reserved') })
    expect(one.adapter.status().message).not.toContain('raw kill error')
    await expect(two.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    await one.adapter.close()
    expect(one.rpc.close).toHaveBeenCalledTimes(2)
    await expect(two.adapter.connect()).resolves.toMatchObject({ state: 'connected' })
  })

  it('bounds a stalled close while keeping the lease until an eventual exit event', async () => {
    vi.useFakeTimers()
    const one = setup()
    const two = setup()
    await one.adapter.connect()
    one.rpc.close.mockImplementation(() => new Promise(() => {}))
    const closing = one.adapter.close().catch(error => error)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await closing).toMatchObject({ code: 'codex_shutdown_failed' })
    await expect(two.adapter.connect()).rejects.toMatchObject({ code: 'codex_busy' })
    expect(vi.getTimerCount()).toBe(0)
    one.emit('transport/exited', {})
    await tick()
    await expect(two.adapter.connect()).resolves.toMatchObject({ state: 'connected' })
  })

  it.each(['inProgress', 'unknown'])('invalidates contradictory turn/completed %s and holds ownership until exit', async status => {
    const ctx = setup()
    await ctx.adapter.connect()
    const exiting = deferred()
    ctx.rpc.close.mockImplementation(() => exiting.promise)
    const generated = ctx.adapter.generate(input).catch(error => error)
    await tick()
    ctx.complete('must not use', status)
    expect(await generated).toMatchObject({ code: 'invalid_response' })
    expect(ctx.rpc.close).toHaveBeenCalledTimes(1)
    await expect(ctx.adapter.generate(input)).rejects.toMatchObject({ code: 'codex_busy' })
    exiting.resolve()
    await tick()
    await expect(ctx.adapter.generate(input)).rejects.toMatchObject({ code: 'codex_not_connected' })
  })
  it.each(['creative', 'edit', 'animate'])('interrupts only the %s owner, waits for terminal acknowledgement and discards late success', async task => {
    vi.useFakeTimers()
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate({ ...input, task }).catch(error => error)
    await tick()
    expect(ctx.adapter.cancel('session-b')).toBe(false)
    expect(ctx.adapter.cancel('session-a')).toBe(true)
    await tick()
    expect(ctx.calls.find(call => call.method === 'turn/interrupt').params).toEqual({ threadId: 'thread-1', turnId: 'turn-1' })
    expect(await generated).toMatchObject({ code: 'cancelled' })
    await expect(ctx.adapter.generate(input)).rejects.toMatchObject({ code: 'codex_busy' })
    ctx.complete('discard late success')
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.rpc.close).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['thread/start', 'turn/start'])('cancels during pending %s and never returns its later output', async method => {
    vi.useFakeTimers()
    const ctx = setup()
    await ctx.adapter.connect()
    const pending = deferred()
    ctx.handlers[method] = () => pending.promise
    const generated = ctx.adapter.generate(input).catch(error => error)
    await tick()
    ctx.adapter.cancel('session-a')
    expect(await generated).toMatchObject({ code: 'cancelled' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.rpc.close).toHaveBeenCalledTimes(1)
    pending.resolve(method === 'turn/start' ? { turn: { id: 'late', status: 'inProgress', items: [] } } : { thread: { id: 'late' } })
    await tick()
    expect(ctx.adapter.status().state).toBe('unavailable')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('interrupts a turn announced during pending start and accepts its early terminal acknowledgement', async () => {
    vi.useFakeTimers()
    const ctx = setup()
    await ctx.adapter.connect()
    const pending = deferred()
    ctx.handlers['turn/start'] = () => pending.promise
    const generated = ctx.adapter.generate(input).catch(error => error)
    await tick()
    ctx.adapter.cancel('session-a')
    ctx.emit('turn/started', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'inProgress', items: [] } })
    await tick()
    expect(ctx.calls.find(call => call.method === 'turn/interrupt').params).toEqual({ threadId: 'thread-1', turnId: 'turn-1' })
    ctx.complete('discard', 'interrupted')
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.rpc.close).not.toHaveBeenCalled()
    pending.resolve({ turn: { id: 'turn-1', status: 'inProgress', items: [] } })
    await tick()
    expect(await generated).toMatchObject({ code: 'cancelled' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not kill an already acknowledged turn when cancellation precedes its start response', async () => {
    vi.useFakeTimers()
    const ctx = setup()
    await ctx.adapter.connect()
    const pending = deferred()
    ctx.handlers['turn/start'] = () => pending.promise
    const generated = ctx.adapter.generate(input).catch(error => error)
    await tick()
    ctx.emit('turn/started', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'inProgress', items: [] } })
    ctx.complete('discard final')
    ctx.adapter.cancel('session-a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.rpc.close).not.toHaveBeenCalled()
    pending.resolve({ turn: { id: 'turn-1', status: 'inProgress', items: [] } })
    await tick()
    expect(await generated).toMatchObject({ code: 'cancelled' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels immediately after preflight without starting a turn', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const controller = new AbortController()
    ctx.handlers['thread/start'] = () => {
      controller.abort()
      return { thread: { id: 'discarded' } }
    }
    await expect(ctx.adapter.generate({ ...input, signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' })
    await tick()
    expect(ctx.calls.some(call => call.method === 'turn/start')).toBe(false)
    expect(ctx.rpc.close).not.toHaveBeenCalled()
  })

  it('drops a connection when cancellation races a rejected turn/start', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const pending = deferred()
    ctx.handlers['turn/start'] = () => pending.promise
    const generated = ctx.adapter.generate(input).catch(error => error)
    await tick()
    ctx.adapter.cancel('session-a')
    pending.reject(new Error('raw upstream details'))
    await tick()
    expect(await generated).toMatchObject({ code: 'cancelled' })
    expect(ctx.rpc.close).toHaveBeenCalledTimes(1)
  })

  it('escalates generation timeout after 900000ms and kills after 5000ms without terminal ack', async () => {
    vi.useFakeTimers()
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate(input).catch(error => error)
    await tick()
    await vi.advanceTimersByTimeAsync(900000)
    expect(await generated).toMatchObject({ code: 'provider_timeout' })
    expect(ctx.calls.some(call => call.method === 'turn/interrupt')).toBe(true)
    expect(ctx.rpc.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.rpc.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles an already-aborted signal without RPC and idempotently closes owned resources', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const controller = new AbortController()
    controller.abort()
    const count = ctx.calls.length
    await expect(ctx.adapter.generate({ ...input, signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' })
    expect(ctx.calls.length).toBe(count)
    await ctx.adapter.close()
    await ctx.adapter.close()
    expect(ctx.rpc.close).toHaveBeenCalledTimes(1)
    expect(ctx.directories.remove).toHaveBeenCalledWith('C:/empty-1')
    expect(ctx.adapter.status().state).toBe('not_connected')
  })

  it('fails active work on child exit or a rejected server tool request with sanitized errors', async () => {
    const ctx = setup()
    await ctx.adapter.connect()
    const generated = ctx.adapter.generate(input).catch(error => error)
    await tick()
    ctx.emit('transport/closed', { code: 'codex_policy', message: 'raw secret' })
    const error = await generated
    expect(error).toMatchObject({ code: 'codex_policy', retryable: false })
    expect(error.message).not.toContain('raw secret')
    expect(ctx.adapter.status().state).toBe('incompatible')
  })
})
