import { randomBytes } from 'node:crypto'
import { ModelError, requestModel as defaultRequestModel } from './providers.js'
import { getAnthropicModelForTask } from '../src/config/llmConfig.js'

const PROVIDERS = ['anthropic', 'openai']
const TASK_BUDGETS = { spec: 4096, creative: 32000, convert: 16384, animate: 16384, edit: 16384, test: 256 }
const SESSION_TTL = 60 * 60 * 1000
const MAX_BODY_BYTES = 2 * 1024 * 1024

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
export function createApi({ env = process.env, requestModel = defaultRequestModel, now = Date.now } = {}) {
  const sessions = new Map()
  const allowedOrigins = new Set((env.LLM_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(localOrigin))
  const environmentKeys = {
    anthropic: env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || '',
    openai: env.OPENAI_API_KEY || ''
  }
  const modelFor = (provider, task) => provider === 'anthropic'
    ? getAnthropicModelForTask(task, env)
    : env[`OPENAI_MODEL_${task.toUpperCase()}`] || env.OPENAI_MODEL || 'gpt-6-astra'
  const status = session => ({
    csrfToken: session.csrfToken,
    provider: session.provider,
    providers: Object.fromEntries(PROVIDERS.map(provider => [provider, {
      model: session.models[provider] || modelFor(provider, 'creative'),
      modelOverride: session.models[provider] || '',
      keySource: session.keys[provider] ? 'session' : environmentKeys[provider] ? 'environment' : null
    }]))
  })

  return async function api(req, res, next = () => send(res, 404, { error: 'Not found' })) {
    const path = req.url?.split('?')[0]
    if (!path?.startsWith('/api/')) return next()
    try {
      const host = req.headers.host || ''
      if (!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host) || new URL(`http://${host}`).port !== String(req.socket.localPort)) {
        fail('invalid_host', 'This API is available only on its local loopback address.', 403)
      }
      const ownOrigin = `http://${host}`
      const origin = req.headers.origin
      const isCompanion = allowedOrigins.has(origin)
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
      if (path === '/api/session' && req.method === 'GET') {
        if (!session) {
          if (sessions.size >= 128) fail('session_limit', 'Too many local sessions. Close unused sessions or restart the server.', 503)
          id = randomBytes(32).toString('hex')
          session = { csrfToken: randomBytes(32).toString('hex'), provider: env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic', keys: {}, models: {}, lastUsed: now(), active: false }
          sessions.set(id, session)
        }
        session.lastUsed = now()
        res.setHeader('Set-Cookie', `threejs_session=${id}; HttpOnly; SameSite=Strict; Path=/api`)
        return send(res, 200, status(session))
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
      if (!origin) fail('invalid_origin', 'Origin is required for API changes.', 403)
      if (!session) fail('session_expired', 'Local session expired. Reopen Model settings and re-enter any session key.', 401)
      if (req.headers['x-csrf-token'] !== session.csrfToken) fail('invalid_csrf', 'Invalid session token. Refresh the page.', 403)
      session.lastUsed = now()
      const body = await readJson(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_request', 'Expected a JSON object.')

      if (path === '/api/settings') {
        if (session.active) fail('busy', 'Wait for the active request or cancel it before changing settings.', 409)
        const { provider, model, apiKey, forgetKey } = body
        if (!PROVIDERS.includes(provider)) fail('invalid_provider', 'Choose Anthropic or OpenAI.')
        if (model !== undefined && (typeof model !== 'string' || (model !== '' && !/^[\w.\-:/]{1,160}$/.test(model)))) fail('invalid_model', 'Enter a valid model ID.')
        if (apiKey !== undefined && (typeof apiKey !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiKey))) fail('invalid_key', 'Enter an API key without spaces or line breaks.')
        session.provider = provider
        if (model !== undefined) session.models[provider] = model
        if (forgetKey === true) delete session.keys[provider]
        else if (apiKey) session.keys[provider] = apiKey
        return send(res, 200, status(session))
      }
      if (path === '/api/asset/code') return send(res, 501, { error: 'Curated source export requires the generator runtime. Use GLB export in the app.' })
      if (!['/api/message', '/api/generate'].includes(path)) return send(res, 404, { error: 'Unknown API endpoint' })
      let { task, system, messages, max_tokens: maxTokens } = body
      if (path === '/api/generate') {
        if (typeof body.prompt !== 'string' || !body.prompt.trim()) fail('invalid_prompt', 'A prompt is required.')
        const { getCodeSystemPrompt } = await import('../src/prompts/codeSystemPrompt.js')
        task = 'creative'; system = getCodeSystemPrompt([])
        messages = [{ role: 'user', content: body.prompt }]
        maxTokens = TASK_BUDGETS.creative
      }
      if (!Object.hasOwn(TASK_BUDGETS, task)) fail('invalid_task', 'Unknown generation task.')
      maxTokens ??= TASK_BUDGETS[task]
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > TASK_BUDGETS[task]) fail('invalid_budget', 'Invalid output token budget for this task.')
      if (typeof system !== 'string' || !Array.isArray(messages) || messages.length < 1 || messages.length > 10 || messages.some(message => !['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string')) fail('invalid_messages', 'Expected text messages with user or assistant roles.')
      if (session.active) fail('busy', 'A generation is already running in this session.', 409)
      session.active = true
      const controller = new AbortController()
      const cancel = () => { if (!res.writableEnded) controller.abort() }
      res.once('close', cancel)
      const timer = setTimeout(() => controller.abort(new ModelError('provider_timeout', 'The provider exceeded the 15-minute request limit. No code was executed. Try again or choose another model.', 504)), 15 * 60 * 1000)
      timer.unref()
      try {
        const provider = session.provider
        const result = await requestModel({ provider, model: session.models[provider] || modelFor(provider, task), apiKey: session.keys[provider] || environmentKeys[provider], system, messages, maxTokens, signal: controller.signal })
        if (path === '/api/generate') {
          const code = result.text.trim().replace(/^```(?:javascript|js)?\s*\n?/, '').replace(/\n?```$/, '')
          return send(res, 200, { success: true, prompt: body.prompt, code, hasAnimation: /(?:update|tick)\s*[:=]/.test(code), provider: result.provider, model: result.model, note: 'Source only; execution and batching happen in the client.' })
        }
        return send(res, 200, result)
      } finally {
        clearTimeout(timer)
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
}
