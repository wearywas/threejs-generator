import { mkdir, mkdtemp, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ModelError } from '../modelErrors.js'
import { createCodexRpc, probeCodexVersion } from './rpc.js'
import { taskFormat, supportsCodexTask, decodeTaskResult } from './taskFormats.js'
import { assertConfigSafety, assertSafety, assertVersion, assertThreadSafety, authState,
  publicModels, buildChildEnv, profilePath, configArguments, validateAuthUrl } from './policy.js'

const STATUS_MESSAGES = {
  not_connected: 'Codex is not connected.', missing: 'Configure a trusted installed Codex executable.',
  incompatible: 'The installed Codex runtime or effective safety policy is not supported.',
  signed_out: 'Sign in to ChatGPT in the separate experimental Codex profile.',
  api_key: 'API-key authentication cannot be used for this experimental connection.',
  connected: 'ChatGPT authentication detected. Generation has not been tested by this status check.',
  unavailable: 'The private Codex connection is unavailable. Reconnect to try again.'
}
const ERRORS = {
  codex_busy: ['Another Codex operation is active.', 409],
  codex_not_connected: ['Connect Codex explicitly before generating.', 409],
  codex_shutdown_failed: ['The owned Codex process has not exited. The connection remains reserved.', 503],
  codex_missing: ['The configured Codex executable was not found.', 503],
  codex_incompatible: ['This Codex version has not been verified for the experimental connection.', 503],
  codex_policy: ['The private Codex safety policy could not be verified.', 503],
  authentication_error: ['Managed ChatGPT authentication is required for this connection.', 401],
  invalid_request: ['This Codex task, model, or text input is not supported.', 400],
  invalid_response: ['Codex did not return a valid completed final answer.', 502],
  provider_error: ['Codex could not complete the generation.', 502],
  refusal: ['Codex declined this request. No partial source was used.', 422],
  provider_timeout: ['The Codex operation timed out. No partial source was used.', 504],
  connection_error: ['The private Codex connection was interrupted.', 502],
  cancelled: ['Codex generation was cancelled. No partial source was used.', 499]
}
const failure = code => new ModelError(code, ...(ERRORS[code] || ERRORS.connection_error))
const sanitize = error => failure(Object.hasOwn(ERRORS, error?.code) ? error.code : 'connection_error')
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const defaultDirectories = {
  ensureProfile: profile => mkdir(profile, { recursive: true }),
  create: () => mkdtemp(path.join(tmpdir(), 'threejs-codex-empty-')),
  // Remove only our empty directories. Never recursively remove unexpected output.
  remove: directory => rmdir(directory)
}
// Shared across sessions (and adapter instances) in this local service process.
let activeOperation = null
// One live private adapter owns the persistent profile, including idle/login/shutdown time.
let profileOwner = null

/** Private, opt-in Codex adapter. No constructor/status side effects or credential reads. */
export function createCodexAdapter({ executable, env = process.env, rpcFactory = createCodexRpc,
  probeVersion = probeCodexVersion, directories = defaultDirectories, now = Date.now, timers = globalThis } = {}) {
  const identity = Symbol('codex-adapter')
  const configuredExecutable = executable ?? env.THREEJS_CODEX_EXECUTABLE
  let connection = null
  let closingConnection = null
  let versionProbe = null
  let control = null
  let disposed = false
  let loginAttempt = null
  let cached = { state: 'not_connected', message: STATUS_MESSAGES.not_connected, models: [], defaultModel: null }
  const cleanups = new Set()

  function status() { return { ...cached, models: cached.models.map(model => ({ ...model })) } }
  function setStatus(state, models = []) {
    cached = { state, message: STATUS_MESSAGES[state], models,
      defaultModel: models.some(model => model.id === 'gpt-6-astra') ? 'gpt-6-astra' : null }
  }
  function removeDirectory(directory) {
    if (!directory) return
    const cleanup = Promise.resolve().then(() => directories.remove(directory)).catch(() => {})
    cleanups.add(cleanup)
    cleanup.finally(() => cleanups.delete(cleanup))
  }
  function publicState(error) {
    if (['codex_policy', 'codex_incompatible'].includes(error.code)) return 'incompatible'
    if (error.code === 'codex_missing') return 'missing'
    return 'unavailable'
  }
  function ownOperation() { return activeOperation?.identity === identity ? activeOperation : null }
  function releaseProfile() {
    if (profileOwner === identity && !connection && !closingConnection && !versionProbe && !control) profileOwner = null
  }

  function finish(op, error, result) {
    if (op.done) return
    op.done = true
    timers.clearTimeout(op.deadline)
    timers.clearTimeout(op.escalation)
    try { op.signal?.removeEventListener('abort', op.abort) } catch { /* Cleanup must release the reservation even for a modified signal. */ }
    op.early = []
    op.finals.clear()
    if (activeOperation === op) activeOperation = null
    if (!op.cleanupOnExit) removeDirectory(op.cwd)
    op.cwd = null
    if (error) op.reject(sanitize(error))
    else op.resolve(result)
  }

  function confirmExit(expected) {
    if (closingConnection !== expected) return
    closingConnection = null
    const attempt = expected.shutdownAttempt
    if (attempt?.pending) {
      attempt.pending = false
      timers.clearTimeout(attempt.timer)
      attempt.resolve()
    }
    expected.unsubscribers.forEach(unsubscribe => unsubscribe())
    for (const directory of expected.cleanupDirectories) removeDirectory(directory)
    releaseProfile()
    if (disposed) setStatus('not_connected')
    else if (cached.message === ERRORS.codex_shutdown_failed[0]) setStatus('unavailable')
  }

  function awaitOwnedExit(expected, retry) {
    if (expected.shutdownAttempt && (expected.shutdownAttempt.pending || !retry)) return expected.shutdownAttempt.promise
    const attempt = { pending: true }
    attempt.promise = new Promise((resolve, reject) => { attempt.resolve = resolve; attempt.reject = reject })
    attempt.promise.catch(() => {})
    expected.shutdownAttempt = attempt
    const failed = () => {
      if (!attempt.pending || closingConnection !== expected) return
      attempt.pending = false
      timers.clearTimeout(attempt.timer)
      const error = failure('codex_shutdown_failed')
      setStatus('unavailable')
      cached.message = error.message
      attempt.reject(error)
    }
    attempt.timer = timers.setTimeout(failed, 5000)
    try { Promise.resolve(expected.rpc.close()).then(() => confirmExit(expected), failed) } catch { failed() }
    return attempt.promise
  }

  function disconnect(error = failure('connection_error'), retry = false) {
    const previous = connection || versionProbe
    connection = null
    versionProbe = null
    loginAttempt = null
    if (previous) {
      closingConnection = previous
      previous.cleanupDirectories = new Set([previous.cwd])
    }
    const op = ownOperation()
    if (op) {
      if (closingConnection && op.cwd) {
        closingConnection.cleanupDirectories.add(op.cwd)
        op.cleanupOnExit = true
      }
      finish(op, op.cancelError || error)
    }
    if (!disposed) setStatus(publicState(error))
    if (closingConnection) return awaitOwnedExit(closingConnection, retry)
    releaseProfile()
    return Promise.resolve()
  }

  function ensureConnection(expected) {
    if (disposed || connection !== expected) throw failure('connection_error')
  }

  async function inspect(expected, cwd, check = () => ensureConnection(expected)) {
    const { rpc, version } = expected
    const response = await rpc.request('config/read', { cwd, includeLayers: false })
    check()
    // Ordering matters: enumeration can initialize integrations in a modified profile.
    assertConfigSafety({ version, config: response?.config })
    const hooks = await rpc.request('hooks/list', { cwds: [cwd] })
    check()
    const mcp = await rpc.request('mcpServerStatus/list', {})
    check()
    assertSafety({ version, config: response.config, hooks, mcp })
    const state = authState(await rpc.request('account/read', { refreshToken: true }))
    check()
    // Signed-out profiles can log in without trying to fetch a protected model catalog.
    const models = state === 'connected' ? publicModels(await rpc.request('model/list', { includeHidden: false })) : []
    check()
    setStatus(state, models)
    return { state, models }
  }

  function runControl(work) {
    if (activeOperation || control || closingConnection || (profileOwner && profileOwner !== identity)) return Promise.reject(failure('codex_busy'))
    if (disposed) return Promise.reject(failure('codex_not_connected'))
    profileOwner = identity
    const token = { controller: new AbortController() }
    control = token
    const signal = token.controller.signal
    let abortListener
    const aborted = new Promise((resolve, reject) => {
      abortListener = () => reject(signal.reason || failure('cancelled'))
      signal.addEventListener('abort', abortListener, { once: true })
    })
    const timer = timers.setTimeout(() => token.controller.abort(failure('provider_timeout')), 30000)
    const check = () => {
      if (signal.aborted) throw signal.reason
      if (disposed || control !== token) throw failure('cancelled')
    }
    token.result = Promise.race([Promise.resolve().then(() => { check(); return work(signal, check) }), aborted]).finally(() => {
      timers.clearTimeout(timer)
      signal.removeEventListener('abort', abortListener)
      if (control === token) control = null
      releaseProfile()
    })
    return token.result
  }

  function onLoginCompleted(expected, params) {
    if (connection !== expected || !loginAttempt || !object(params)) return
    if (!loginAttempt.id) { loginAttempt.early = params; return }
    if (params.loginId !== loginAttempt.id) return
    loginAttempt = null
    if (params.success !== true) { setStatus('signed_out'); return }
    // Refresh is read-only and has the same deadline and safety gates as Connect.
    const refresh = () => {
      if (connection !== expected || disposed) return
      runControl(async (signal, check) => inspect(expected, expected.cwd, () => { check(); ensureConnection(expected) }))
        .catch(error => { if (connection === expected) disconnect(sanitize(error)) })
    }
    if (control) {
      // Completion can arrive before account/login/start returns its response.
      expected.loginRefresh = true
    } else refresh()
  }

  function subscribe(expected) {
    const listen = (name, callback) => expected.unsubscribers.push(expected.rpc.onNotification(name, callback))
    listen('transport/closed', params => { if (connection === expected) disconnect(sanitize(params)) })
    listen('transport/exited', () => confirmExit(expected))
    listen('account/login/completed', params => onLoginCompleted(expected, params))
    listen('account/updated', () => {
      if (connection === expected) setStatus('unavailable')
    })
    for (const name of ['turn/started', 'turn/completed', 'item/started', 'item/completed', 'thread/tokenUsage/updated', 'error']) {
      listen(name, params => receive(expected, name, params))
    }
  }

  async function connect() {
    try {
      return await runControl(async (signal, check) => {
        if (!connection) {
          if (typeof configuredExecutable !== 'string' || !path.isAbsolute(configuredExecutable)) throw failure('codex_missing')
          const profile = profilePath({ env })
          await directories.ensureProfile(profile)
          check()
          const cwd = await directories.create()
          try {
            check()
            const childEnv = buildChildEnv(env, profile)
            const probe = { cwd, unsubscribers: [], cleanupDirectories: new Set([cwd]) }
            versionProbe = probe
            const exited = () => {
              probe.exited = true
              if (versionProbe === probe) versionProbe = null
              confirmExit(probe)
              releaseProfile()
            }
            probe.rpc = { close: () => probe.stop ? probe.stop() : probe.work.then(() => {}, error => {
              if (error?.code === 'codex_shutdown_failed') throw error
            }) }
            probe.work = Promise.resolve(probeVersion({ executable: configuredExecutable, cwd, env: childEnv, signal, timers,
              onExit: exited, onShutdown: stop => { probe.stop = stop } }))
            let version
            try { version = await probe.work; exited() } catch (error) {
              if (error?.code !== 'codex_shutdown_failed') exited()
              throw error
            }
            check()
            assertVersion(version)
            const rpc = rpcFactory({ executable: configuredExecutable, cwd, env: childEnv, configArgs: configArguments(), timers })
            connection = { rpc, cwd, version, unsubscribers: [] }
            subscribe(connection)
          } catch (error) {
            if (versionProbe?.cwd !== cwd && closingConnection?.cwd !== cwd) removeDirectory(cwd)
            throw error
          }
        }
        const expected = connection
        await inspect(expected, expected.cwd, () => { check(); ensureConnection(expected) })
        return status()
      })
    } catch (error) {
      const safe = sanitize(error)
      if (safe.code === 'codex_busy') throw safe
      if (!disposed) disconnect(safe)
      return status()
    } finally {
      if (connection?.loginRefresh && !control) {
        connection.loginRefresh = false
        void connect().catch(() => {})
      }
    }
  }

  async function login() {
    try {
      return await runControl(async (signal, check) => {
        const expected = connection
        if (!expected) throw failure('codex_not_connected')
        let inspected = await inspect(expected, expected.cwd, () => { check(); ensureConnection(expected) })
        if (inspected.state === 'api_key') throw failure('authentication_error')
        // A completion notification can overtake an account/read response captured
        // while signed out. Refresh that snapshot, never start a replacement login.
        if (expected.loginRefresh) {
          expected.loginRefresh = false
          inspected = await inspect(expected, expected.cwd, () => { check(); ensureConnection(expected) })
          if (inspected.state !== 'connected') throw failure('authentication_error')
        }
        if (inspected.state === 'connected') {
          loginAttempt = null
          return status()
        }
        // Only explicit login may retrieve this private link; status/refresh never expose it.
        if (loginAttempt?.authUrl) return { ...status(), authUrl: loginAttempt.authUrl }
        loginAttempt = { id: null, early: null }
        const response = await expected.rpc.request('account/login/start', { type: 'chatgpt' })
        check()
        ensureConnection(expected)
        if (response?.type !== 'chatgpt' || typeof response.loginId !== 'string') throw failure('codex_policy')
        const authUrl = validateAuthUrl(response.authUrl)
        loginAttempt.id = response.loginId
        loginAttempt.authUrl = authUrl
        if (loginAttempt.early) onLoginCompleted(expected, loginAttempt.early)
        return { ...status(), authUrl }
      })
    } catch (error) {
      const safe = sanitize(error)
      if (!['codex_busy', 'authentication_error', 'codex_not_connected'].includes(safe.code)) disconnect(safe)
      throw safe
    } finally {
      if (connection?.loginRefresh && !control) {
        connection.loginRefresh = false
        void connect().catch(() => {})
      }
    }
  }

  function checkOperation(op) {
    if (op.cancelError) throw op.cancelError
    if (op.done || activeOperation !== op) throw failure('cancelled')
    ensureConnection(op.connection)
    if (now() - op.startedAt >= 900000) throw failure('provider_timeout')
  }

  function interrupt(op) {
    if (op.done || !op.threadId || !op.turnId || op.interrupted) return
    op.interrupted = true
    op.connection.rpc.request('turn/interrupt', { threadId: op.threadId, turnId: op.turnId })
      .catch(() => { if (!op.done) disconnect(op.cancelError || failure('connection_error')) })
  }

  function cancelOperation(op, error = failure('cancelled')) {
    if (op.done || op.cancelError) return
    op.cancelError = error
    const acknowledged = op.early.some(([method, params]) => method === 'turn/completed'
      && params.turn?.id === op.turnId && ['completed', 'failed', 'interrupted'].includes(params.turn.status))
    if (acknowledged) { finish(op, error); return }
    op.finals.clear()
    op.early = []
    op.reject(error)
    timers.clearTimeout(op.deadline)
    // Applies even when preflight, thread creation, or turn/start has not replied yet.
    op.escalation = timers.setTimeout(() => {
      if (!op.done) disconnect(error)
    }, 5000)
    interrupt(op)
  }

  function acceptItem(op, item, completed) {
    if (!object(item) || typeof item.type !== 'string') throw failure('invalid_response')
    const safeTypes = ['userMessage', 'agentMessage', 'reasoning', 'plan', 'functionCallOutput', 'sleep', 'contextCompaction']
    if (!safeTypes.includes(item.type)) throw failure('codex_policy')
    if (item.type !== 'agentMessage' || item.phase !== 'final_answer' || !completed) return
    if (typeof item.id !== 'string' || typeof item.text !== 'string' || item.text.length > 500000) throw failure('invalid_response')
    op.finals.set(item.id, item.text)
    if ([...op.finals.values()].reduce((size, text) => size + text.length, 0) > 500000) throw failure('invalid_response')
  }

  function receive(expected, method, params) {
    const op = ownOperation()
    if (!op || op.done || connection !== expected || op.connection !== expected || params?.threadId !== op.threadId) return
    const turnId = params.turn?.id || params.turnId
    if (typeof turnId !== 'string') return disconnect(failure('invalid_response'))
    if (method === 'turn/completed' && (!op.turnId || op.turnId === turnId)
      && !['completed', 'failed', 'interrupted'].includes(params.turn?.status)) {
      return disconnect(failure('invalid_response'))
    }
    if (!op.startConfirmed) {
      if (method === 'turn/started') {
        if (op.turnId && op.turnId !== turnId) return disconnect(failure('invalid_response'))
        op.turnId = turnId
        if (op.cancelError) interrupt(op)
      }
      if (op.cancelError && op.turnId === turnId && method === 'turn/completed'
        && ['completed', 'failed', 'interrupted'].includes(params.turn?.status)) {
        finish(op, op.cancelError)
        return
      }
      if (op.early.length >= 128 || JSON.stringify(params).length + op.earlySize > 1000000) return disconnect(failure('invalid_response'))
      op.earlySize += JSON.stringify(params).length
      op.early.push([method, params])
      return
    }
    if (turnId !== op.turnId) return
    if (op.cancelError) {
      if (method === 'turn/completed' && ['completed', 'failed', 'interrupted'].includes(params.turn?.status)) finish(op, op.cancelError)
      return
    }
    try {
      if (method === 'item/started' || method === 'item/completed') acceptItem(op, params.item, method === 'item/completed')
      if (method === 'error') {
        const code = ['misalignmentPolicyViolation', 'cyberPolicy'].includes(params.error?.codexErrorInfo) ? 'refusal' : 'provider_error'
        disconnect(failure(code))
        return
      }
      if (method === 'thread/tokenUsage/updated') {
        const reported = params.tokenUsage?.total
        if (object(reported)) {
          const usage = {}
          for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'reasoningOutputTokens']) {
            if (Number.isSafeInteger(reported[key]) && reported[key] >= 0) usage[key] = reported[key]
          }
          if (Object.keys(usage).length) op.usage = usage
        }
      }
      if (method !== 'turn/completed') return
      const turn = params.turn
      if (turn.status !== 'completed' || turn.error) {
        if (turn.status === 'interrupted') throw failure('cancelled')
        throw failure(turn.status === 'refused' || ['misalignmentPolicyViolation', 'cyberPolicy'].includes(turn.error?.codexErrorInfo) ? 'refusal' : 'provider_error')
      }
      if (!Array.isArray(turn.items)) throw failure('invalid_response')
      for (const item of turn.items) acceptItem(op, item, true)
      // Multiple distinct final messages are ambiguous; never concatenate partial source.
      if (op.finals.size !== 1) throw failure('invalid_response')
      let text = [...op.finals.values()][0]
      if (!text.trim()) throw failure('invalid_response')
      text = decodeTaskResult(op.task, text)
      finish(op, null, { text, provider: 'codex', requestedModel: op.model, model: op.model,
        ...(op.usage ? { usage: op.usage } : {}), stopReason: 'completed' })
    } catch (error) {
      const safe = sanitize(error)
      // A prohibited capability or malformed stream invalidates this connection.
      if (safe.code === 'codex_policy' || method !== 'turn/completed') disconnect(safe)
      else finish(op, safe)
    }
  }

  async function runGeneration(op, input) {
    try {
      const directory = await directories.create()
      if (op.done) { removeDirectory(directory); return }
      op.cwd = directory
      checkOperation(op)
      const inspected = await inspect(op.connection, directory, () => checkOperation(op))
      if (inspected.state !== 'connected') throw failure('authentication_error')
      if (!inspected.models.some(model => model.id === op.model)) throw failure('invalid_request')
      const format = taskFormat(op.task)
      const thread = await op.connection.rpc.request('thread/start', {
        model: op.model, modelProvider: 'openai', ephemeral: true, allowProviderModelFallback: false,
        approvalPolicy: 'never', sandbox: 'read-only', environments: [], dynamicTools: [], selectedCapabilityRoots: [],
        runtimeWorkspaceRoots: [], cwd: directory,
        developerInstructions: input.system + (format?.instructions || ''), experimentalRawEvents: false
      })
      checkOperation(op)
      assertThreadSafety(thread, op.model, directory)
      op.threadId = thread.thread.id
      const state = authState(await op.connection.rpc.request('account/read', { refreshToken: true }))
      checkOperation(op)
      if (state !== 'connected') { setStatus(state); throw failure('authentication_error') }
      op.startSent = true
      const start = await op.connection.rpc.request('turn/start', {
        threadId: op.threadId, model: op.model, environments: [], runtimeWorkspaceRoots: [],
        approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false },
        input: input.messages.map(message => ({ type: 'text', text: message.content, text_elements: [] })),
        ...(format ? { outputSchema: format.schema } : {})
      })
      if (op.done) return
      if (typeof start?.turn?.id !== 'string' || (op.turnId && op.turnId !== start.turn.id)) throw failure('invalid_response')
      if (!['inProgress', 'completed'].includes(start.turn.status) || start.turn.error) throw failure('provider_error')
      op.turnId = start.turn.id
      op.startConfirmed = true
      if (op.cancelError) interrupt(op)
      const early = op.early
      op.early = []
      for (const [method, params] of early) receive(op.connection, method, params)
    } catch (error) {
      if (op.done) return
      const safe = sanitize(op.cancelError || error)
      if (op.cancelError && op.startSent) disconnect(safe)
      else if (op.cancelError) finish(op, safe)
      else if (['codex_policy', 'connection_error', 'invalid_response', 'provider_error'].includes(safe.code)) disconnect(safe)
      else finish(op, safe)
    }
  }

  function generate(input = {}) {
    if (activeOperation || control || loginAttempt || closingConnection || (profileOwner && profileOwner !== identity)) return Promise.reject(failure('codex_busy'))
    if (disposed || !connection) return Promise.reject(failure('codex_not_connected'))
    let op
    let promise
    try {
      if (!object(input) || !supportsCodexTask(input.task) || typeof input.owner !== 'string' || !input.owner
        || typeof input.model !== 'string' || !input.model || typeof input.system !== 'string'
        || !Array.isArray(input.messages) || input.messages.length === 0
        || input.messages.some(message => !object(message) || message.role !== 'user' || typeof message.content !== 'string')) {
        throw failure('invalid_request')
      }
      if (input.signal != null) {
        // Brand-check without trusting a caller's `aborted` property or methods.
        Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get.call(input.signal)
        if (typeof input.signal.addEventListener !== 'function' || typeof input.signal.removeEventListener !== 'function') throw failure('invalid_request')
      }
      if (input.signal?.aborted) return Promise.reject(failure('cancelled'))
      let resolve
      let reject
      promise = new Promise((a, b) => { resolve = a; reject = b })
      op = { identity, owner: input.owner, task: input.task, model: input.model, signal: input.signal,
        connection, startedAt: now(), resolve, reject, finals: new Map(), early: [], earlySize: 0 }
      // This assignment precedes every await, including policy/auth/catalog checks.
      activeOperation = op
      op.abort = () => cancelOperation(op)
      op.signal?.addEventListener('abort', op.abort, { once: true })
      op.deadline = timers.setTimeout(() => cancelOperation(op, failure('provider_timeout')), 900000)
      void runGeneration(op, input)
      return promise
    } catch {
      if (op && activeOperation === op) {
        finish(op, failure('invalid_request'))
        return promise
      }
      return Promise.reject(failure('invalid_request'))
    }
  }

  function cancel(owner) {
    const op = ownOperation()
    if (!op || op.owner !== owner || op.done) return false
    cancelOperation(op)
    return true
  }

  async function close() {
    const controlling = control?.result
    if (!disposed) {
      disposed = true
      control?.controller.abort(failure('cancelled'))
    }
    await disconnect(failure('cancelled'), true)
    if (controlling) await controlling.catch(() => {})
    releaseProfile()
    setStatus('not_connected')
    await Promise.all([...cleanups])
  }

  return { connect, login, status, generate, cancel, close }
}
