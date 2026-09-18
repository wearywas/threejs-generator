import { randomBytes } from 'node:crypto'
import { ModelError, requestModel as defaultRequestModel } from './providers.js'
import { getAnthropicModelForTask } from '../src/config/llmConfig.js'
import { createCodexAdapter as defaultCreateCodexAdapter } from './codex/adapter.js'
import { supportsCodexTask } from './codex/taskFormats.js'

const PROVIDERS = ['anthropic', 'openai']
const TASK_BUDGETS = { spec: 4096, creative: 32000, convert: 16384, animate: 16384, edit: 16384, test: 256 }
const SESSION_TTL = 60 * 60 * 1000
const MAX_BODY_BYTES = 2 * 1024 * 1024
const CODEX_TIMEOUT = 'The Codex request was interrupted after the 15-minute limit. Interrupted work may still use your ChatGPT allowance. No partial code was used.'

function fail(code, message, status = 400) { throw new ModelError(code, message, status) }
function send(res, status, value) {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(value))
}
function localOrigin(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.origin === value
  } catch { return false }
}
function codexConnection(adapter) {
  const { state, message, models, defaultModel } = adapter.status()
  return { state, message, models: models.map(({ id, name }) => ({ id, name })), defaultModel }
}
function loginUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && ['auth.openai.com', 'auth0.openai.com'].includes(url.hostname)
      && !url.username && !url.password && !url.href.includes('#') && !url.port) return url.href
  } catch { /* Never expose raw login URL or parser errors. */ }
  fail('invalid_response', 'Codex returned an invalid managed sign-in URL.', 502)
}
function codexResponse(result) {
  const { text, model, requestedModel, stopReason } = result
  const usage = {}
  for (const [key, normalized] of [
    ['inputTokens', 'input_tokens'], ['outputTokens', 'output_tokens'], ['totalTokens', 'total_tokens'],
    ['cachedInputTokens', 'cached_input_tokens'], ['cacheWriteInputTokens', 'cache_write_input_tokens'],
    ['reasoningOutputTokens', 'reasoning_output_tokens'],
  ]) {
    const value = result.usage?.[key]
    if (Number.isSafeInteger(value) && value >= 0) usage[normalized] = value
  }
  return { text, provider: 'codex', model, requestedModel, stopReason, ...(Object.keys(usage).length ? { usage } : {}) }
}
function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail('content_type', 'Send JSON with Content-Type: application/json.', 415)
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    const timer = setTimeout(() => reject(new ModelError('body_timeout', 'Request body timed out.', 408)), 30000)
    timer.unref()
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        clearTimeout(timer)
        chunks.length = 0
        reject(new ModelError('body_too_large', 'Request exceeds the 2 MiB limit.', 413))
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      clearTimeout(timer)
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new ModelError('invalid_json', 'Request is not valid JSON.', 400)) }
    })
    req.on('error', () => { clearTimeout(timer); reject(new ModelError('body_error', 'Request body could not be read.', 400)) })
  })
}

/** Shared development/production API. Keys and configuration belong to a local session. */
export function createApi({ env = process.env, requestModel = defaultRequestModel, now = Date.now, createCodexAdapter = defaultCreateCodexAdapter } = {}) {
  const sessions = new Map()
  const codex = env.THREEJS_EXPERIMENTAL_CODEX === '1' ? createCodexAdapter({ executable: env.THREEJS_CODEX_EXECUTABLE, env }) : null
  const controllers = new Set()
  let closed = false
  let closing
  const allowedOrigins = new Set((env.LLM_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(localOrigin))
  const environmentKeys = {
    anthropic: env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || '',
    openai: env.OPENAI_API_KEY || ''
  }
  const modelFor = (provider, task) => provider === 'anthropic'
    ? getAnthropicModelForTask(task, env)
    : env[`OPENAI_MODEL_${task.toUpperCase()}`] || env.OPENAI_MODEL || 'gpt-6-astra'
  const status = (session, includeCodex = true) => {
    const providers = Object.fromEntries(PROVIDERS.map(provider => [provider, {
      model: session.models[provider] || modelFor(provider, 'creative'),
      modelOverride: session.models[provider] || '',
      keySource: session.keys[provider] ? 'session' : environmentKeys[provider] ? 'environment' : null
    }]))
    if (codex && includeCodex) {
      const connection = codexConnection(codex)
      providers.codex = { model: session.models.codex || connection.defaultModel || '', modelOverride: session.models.codex || '', connection }
    }
    return { csrfToken: session.csrfToken, provider: session.provider, providers }
  }

  async function api(req, res, next = () => send(res, 404, { error: 'Not found' })) {
    const path = req.url?.split('?')[0]
    if (!path?.startsWith('/api/')) return next()
    try {
      if (closed) fail('service_closed', 'The local service is shutting down.', 503)
      const host = req.headers.host || ''
      if (!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host) || new URL(`http://${host}`).port !== String(req.socket.localPort)) {
        fail('invalid_host', 'This API is available only on its local loopback address.', 403)
      }
      const ownOrigin = `http://${host}`
      const origin = req.headers.origin
      const isCompanion = allowedOrigins.has(origin)
      const codexPath = path.startsWith('/api/codex/')
      if (codexPath && !codex) return send(res, 404, { error: 'Unknown API endpoint' })
      const requireOwnOrigin = () => {
        if (origin !== ownOrigin) fail('invalid_origin', 'Codex is available only from this app origin.', 403)
      }
      if (codexPath) requireOwnOrigin()
      if ((origin && origin !== ownOrigin && !isCompanion) || (!origin && req.headers['sec-fetch-site'] === 'cross-site')) {
        fail('invalid_origin', 'Cross-origin API access is not allowed.', 403)
      }
      if (isCompanion) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Vary', 'Origin')
      }
      if (req.method === 'OPTIONS') {
        if (!origin) fail('invalid_origin', 'Origin is required.', 403)
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token')
        res.writeHead(204); res.end(); return
      }
      if (path === '/api/health' && req.method === 'GET') return send(res, 200, { status: 'ok', service: 'threejs-generator', version: '0.1.0' })
      if (path === '/api/generators' && req.method === 'GET') {
        const { generatorSchemas } = await import('../src/schemas/assetSpec.js')
        return send(res, 200, { generators: Object.entries(generatorSchemas).map(([name, schema]) => ({ name, displayName: schema.name || name, description: schema.description || '' })) })
      }
      const schemaMatch = path.match(/^\/api\/generator\/([\w-]+)\/schema$/)
      if (schemaMatch && req.method === 'GET') {
        const { generatorSchemas } = await import('../src/schemas/assetSpec.js')
        const schema = generatorSchemas[schemaMatch[1]]
        return send(res, schema ? 200 : 404, schema ? { schema } : { error: 'Unknown generator' })
      }

      for (const [id, entry] of sessions) {
        if (now() - entry.lastUsed > SESSION_TTL && !entry.active) sessions.delete(id)
      }
      let id = req.headers.cookie?.split(';').map(pair => pair.trim()).find(pair => pair.startsWith('threejs_session='))?.slice('threejs_session='.length)
      let session = sessions.get(id)
      if (session?.provider === 'codex' && origin && origin !== ownOrigin) requireOwnOrigin()
      if (path === '/api/session' && req.method === 'GET') {
        if (!session) {
          if (sessions.size >= 128) fail('session_limit', 'Too many local sessions. Close unused sessions or restart the server.', 503)
          id = randomBytes(32).toString('hex')
          session = { csrfToken: randomBytes(32).toString('hex'), provider: env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic', keys: {}, models: {}, lastUsed: now(), active: false }
          sessions.set(id, session)
        }
        session.lastUsed = now()
        res.setHeader('Set-Cookie', `threejs_session=${id}; HttpOnly; SameSite=Strict; Path=/api`)
        return send(res, 200, status(session, !origin || origin === ownOrigin))
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
      if (!origin) fail('invalid_origin', 'Origin is required for API changes.', 403)
      if (!session) fail('session_expired', 'Local session expired. Reopen Model settings and re-enter any session key.', 401)
      if (req.headers['x-csrf-token'] !== session.csrfToken) fail('invalid_csrf', 'Invalid session token. Refresh the page.', 403)
      session.lastUsed = now()
      const body = await readJson(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_request', 'Expected a JSON object.')
      // Shutdown may have started while a request body was still arriving.
      if (closed) fail('service_closed', 'The local service is shutting down.', 503)

      if (path === '/api/codex/connect' || path === '/api/codex/login') {
        if (session.active) fail('busy', 'Wait for the active request or cancel it before connecting.', 409)
        const action = path.endsWith('/login') ? 'login' : 'connect'
        if (action === 'login' && codex.status().state === 'api_key') fail('authentication_error', 'API-key authentication cannot be changed through this experimental connection.', 401)
        session.active = true
        try {
          const result = await codex[action]()
          const authUrl = action === 'login' && !(result.state === 'connected' && result.authUrl == null)
            ? loginUrl(result.authUrl) : undefined
          return send(res, 200, { session: status(session), ...(authUrl ? { authUrl } : {}) })
        } finally {
          session.active = false
          session.lastUsed = now()
        }
      }

      if (path === '/api/settings') {
        if (session.active) fail('busy', 'Wait for the active request or cancel it before changing settings.', 409)
        const { provider, model, apiKey, forgetKey } = body
        if (!PROVIDERS.includes(provider) && !(codex && provider === 'codex')) fail('invalid_provider', codex ? 'Choose Anthropic, OpenAI or experimental Codex.' : 'Choose Anthropic or OpenAI.')
        if (provider === 'codex') {
          requireOwnOrigin()
          if (Object.hasOwn(body, 'apiKey') || Object.hasOwn(body, 'forgetKey')) fail('invalid_key', 'Codex uses managed ChatGPT sign-in, not API key settings.')
          if (model !== undefined && model !== '' && !codex.status().models.some(entry => entry.id === model)) fail('invalid_model', 'Choose a model from the connected Codex catalog.')
        }
        if (model !== undefined && (typeof model !== 'string' || (model !== '' && !/^[\w.\-:/]{1,160}$/.test(model)))) fail('invalid_model', 'Enter a valid model ID.')
        if (apiKey !== undefined && (typeof apiKey !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiKey))) fail('invalid_key', 'Enter an API key without spaces or line breaks.')
        session.provider = provider
        if (model !== undefined) session.models[provider] = model
        if (forgetKey === true) delete session.keys[provider]
        else if (apiKey) session.keys[provider] = apiKey
        return send(res, 200, status(session, origin === ownOrigin))
      }
      if (path === '/api/asset/code') return send(res, 501, { error: 'Curated source export requires the generator runtime. Use GLB export in the app.' })
      if (!['/api/message', '/api/generate'].includes(path)) return send(res, 404, { error: 'Unknown API endpoint' })
      const provider = session.provider
      if (provider === 'codex') requireOwnOrigin()
      let { task, system, messages, max_tokens: maxTokens } = body
      if (path === '/api/generate') {
        if (typeof body.prompt !== 'string' || !body.prompt.trim()) fail('invalid_prompt', 'A prompt is required.')
        const { getCodeSystemPrompt } = await import('../src/prompts/codeSystemPrompt.js')
        task = 'creative'; system = getCodeSystemPrompt([])
        messages = [{ role: 'user', content: body.prompt }]
        maxTokens = TASK_BUDGETS.creative
      }
      if (!Object.hasOwn(TASK_BUDGETS, task)) fail('invalid_task', 'Unknown generation task.')
      if (provider === 'codex' && !supportsCodexTask(task)) fail('unsupported_task', 'This task is not supported by the experimental Codex connection.')
      maxTokens ??= TASK_BUDGETS[task]
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > TASK_BUDGETS[task]) fail('invalid_budget', 'Invalid output token budget for this task.')
      if (typeof system !== 'string' || !Array.isArray(messages) || messages.length < 1 || messages.length > 10 || messages.some(message => !['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string')) fail('invalid_messages', 'Expected text messages with user or assistant roles.')
      if (session.active) fail('busy', 'A generation is already running in this session.', 409)
      const model = session.models[provider] || (provider === 'codex' ? codex.status().defaultModel : modelFor(provider, task))
      if (provider === 'codex' && (!model || !codex.status().models.some(entry => entry.id === model))) fail('invalid_model', 'Connect Codex and choose a model from its catalog before generating.')
      session.active = true
      const controller = new AbortController()
      controllers.add(controller)
      const cancel = () => { if (!res.writableEnded) controller.abort() }
      res.once('close', cancel)
      const timer = setTimeout(() => controller.abort(new ModelError('provider_timeout', provider === 'codex' ? CODEX_TIMEOUT : 'The provider exceeded the 15-minute request limit. No code was executed. Try again or choose another model.', 504)), 15 * 60 * 1000)
      timer.unref()
      try {
        const result = provider === 'codex'
          ? codexResponse(await codex.generate({ owner: id, task, model, system, messages, signal: controller.signal }))
          : await requestModel({ provider, model, apiKey: session.keys[provider] || environmentKeys[provider], system, messages, maxTokens, signal: controller.signal })
        if (controller.signal.aborted) throw controller.signal.reason
        if (path === '/api/generate') {
          const code = result.text.trim().replace(/^```(?:javascript|js)?\s*\n?/, '').replace(/\n?```$/, '')
          return send(res, 200, { success: true, prompt: body.prompt, code, hasAnimation: /(?:update|tick)\s*[:=]/.test(code), provider: result.provider, model: result.model, note: 'Source only; execution and batching happen in the client.' })
        }
        return send(res, 200, result)
      } catch (error) {
        if (provider === 'codex' && controller.signal.reason?.code === 'provider_timeout') fail('provider_timeout', CODEX_TIMEOUT, 504)
        if (provider === 'codex' && error.code === 'provider_timeout') fail('provider_timeout', 'The Codex operation timed out. Interrupted work may still use your ChatGPT allowance. No partial code was used.', 504)
        throw error
      } finally {
        clearTimeout(timer)
        controllers.delete(controller)
        res.off('close', cancel)
        session.active = false
        session.lastUsed = now()
      }
    } catch (error) {
      if (error.name === 'AbortError') return send(res, 504, { code: 'request_cancelled', error: 'The request was cancelled or timed out. No code was executed.', retryable: false })
      send(res, error instanceof ModelError ? error.status : 500, {
        code: error instanceof ModelError ? error.code : 'internal_error',
        error: error instanceof ModelError ? error.message : 'The local service could not complete this request.',
        retryable: false
      })
    }
  }
  // Promise identity and ownership survive failure; do not silently retry or abandon a child.
  api.close = () => {
    if (!closing) {
      closed = true
      for (const controller of controllers) controller.abort()
      closing = Promise.resolve().then(() => codex?.close()).catch(() => {
        throw new ModelError('codex_shutdown_failed', 'The owned Codex connection could not be closed and may still be reserved.', 503)
      })
    }
    return closing
  }
  return api
}
