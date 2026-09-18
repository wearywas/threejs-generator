import { spawn } from 'node:child_process'
import { ModelError } from '../modelErrors.js'

const RPC_TIMEOUT = 30000
const LINE_LIMIT = 8388608
const METHODS = new Set(['account/read', 'account/login/start', 'model/list', 'config/read',
  'hooks/list', 'mcpServerStatus/list', 'thread/start', 'turn/start', 'turn/interrupt'])
const NOTIFICATIONS = new Set(['account/login/completed', 'account/updated', 'turn/started',
  'turn/completed', 'item/started', 'item/completed', 'thread/tokenUsage/updated', 'error', 'transport/closed', 'transport/exited'])
const connectionError = () => new ModelError('connection_error', 'The private Codex connection is unavailable.')
const protocolError = () => new ModelError('invalid_response', 'Codex returned an unsupported response.')
const timeoutError = () => new ModelError('provider_timeout', 'The private Codex request timed out.', 504)
const shutdownError = () => new ModelError('codex_shutdown_failed', 'The owned Codex process has not exited. The connection remains reserved.', 503)

/** A private, bounded JSON-lines transport. No raw error or stderr is public. */
export function createCodexRpc({ spawnProcess = spawn, executable, cwd, env, configArgs = [], timers = globalThis } = {}) {
  let child
  let closedError
  let exitConfirmed = false
  let termination
  let nextId = 0
  let buffer = Buffer.alloc(0)
  const pending = new Map()
  const listeners = new Map()

  function emit(method, params) {
    for (const listener of listeners.get(method) || []) {
      try { listener(params) } catch { /* Consumer failures must not escape a stdio event. */ }
    }
  }

  function invalidate(error) {
    if (closedError) return
    closedError = error
    buffer = Buffer.alloc(0)
    for (const entry of pending.values()) {
      timers.clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
    emit('transport/closed', { code: error.code })
  }

  function close(error = connectionError(), exited = false, retry = false) {
    if (exited) {
      if (!exitConfirmed) {
        exitConfirmed = true
        invalidate(error)
        if (termination?.pending) {
          termination.pending = false
          timers.clearTimeout(termination.timer)
          termination.resolve()
        }
        emit('transport/exited', {})
        listeners.clear()
      }
      return Promise.resolve()
    }
    if (exitConfirmed) return Promise.resolve()
    if (termination && (termination.pending || !retry)) return termination.promise
    const attempt = { pending: true }
    attempt.promise = new Promise((resolve, reject) => { attempt.resolve = resolve; attempt.reject = reject })
    // Protocol-triggered shutdown has no direct caller; explicit close still observes rejection.
    attempt.promise.catch(() => {})
    termination = attempt
    function failed() {
      if (!attempt.pending || exitConfirmed) return
      attempt.pending = false
      timers.clearTimeout(attempt.timer)
      attempt.reject(shutdownError())
    }
    attempt.timer = timers.setTimeout(failed, 5000)
    invalidate(error)
    if (!child) close(error, true)
    else {
      try { child.stdin.end() } catch { /* Shutdown still requires exit confirmation. */ }
      try { if (!child.kill('SIGKILL')) failed() } catch { failed() }
    }
    return attempt.promise
  }

  function write(message) {
    if (closedError) throw closedError
    try {
      const line = JSON.stringify(message)
      if (Buffer.byteLength(line) > LINE_LIMIT) throw protocolError()
      child.stdin.write(`${line}\n`)
    } catch (error) {
      close(error instanceof ModelError ? error : connectionError())
      throw closedError
    }
  }

  function send(method, params) {
    if (closedError) return Promise.reject(closedError)
    return new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = timers.setTimeout(() => close(timeoutError()), RPC_TIMEOUT)
      pending.set(id, { resolve, reject, timer })
      try { write({ id, method, params }) } catch { /* close rejects every pending request. */ }
    })
  }

  function accept(line) {
    let message
    try { message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)) } catch { return close(protocolError()) }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return close(protocolError())
    if (Object.hasOwn(message, 'method')) {
      if (typeof message.method !== 'string') return close(protocolError())
      if (Object.hasOwn(message, 'id')) {
        if (typeof message.id !== 'string' && !Number.isSafeInteger(message.id)) return close(protocolError())
        try { write({ id: message.id, error: { code: -32601, message: 'Unsupported server request.' } }) } catch { return }
        return close(new ModelError('codex_policy', 'Codex requested an unsupported capability.'))
      }
      if (NOTIFICATIONS.has(message.method) && !message.method.startsWith('transport/')) emit(message.method, message.params)
      return
    }
    const entry = pending.get(message.id)
    if (!entry || Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')) return close(protocolError())
    pending.delete(message.id)
    timers.clearTimeout(entry.timer)
    if (Object.hasOwn(message, 'error')) entry.reject(new ModelError('provider_error', 'Codex could not complete the private request.'))
    else entry.resolve(message.result)
  }

  function read(chunk) {
    if (closedError) return
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    let offset = 0
    while (offset < bytes.length && !closedError) {
      const newline = bytes.indexOf(10, offset)
      const end = newline < 0 ? bytes.length : newline
      if (buffer.length + end - offset > LINE_LIMIT) return close(protocolError())
      buffer = Buffer.concat([buffer, bytes.subarray(offset, end)])
      if (newline < 0) return
      const line = buffer
      buffer = Buffer.alloc(0)
      accept(line)
      offset = end + 1
    }
  }

  try {
    child = spawnProcess(executable, ['app-server', '--listen', 'stdio://', ...configArgs], {
      cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
    })
    child.stdout.on('data', read)
    child.stdout.on('error', () => close(connectionError()))
    child.stdin.on('error', () => close(connectionError()))
    child.on('error', () => close(connectionError(), !child.pid))
    child.on('exit', () => close(connectionError(), true))
    child.on('close', () => close(connectionError(), true))
  } catch { close(connectionError()) }

  const initialized = send('initialize', {
    clientInfo: { name: 'threejs_generator_experimental', version: '0.1.0' },
    capabilities: { experimentalApi: true }
  }).then(() => { write({ method: 'initialized' }) }).catch(error => { close(error); throw error })
  // Construction may fail before the first caller attaches its request handler.
  initialized.catch(() => {})

  return {
    async request(method, params = {}) {
      if (!METHODS.has(method)) throw new ModelError('invalid_request', 'Unsupported Codex request.', 400)
      await initialized
      return send(method, params)
    },
    onNotification(method, listener) {
      if (!NOTIFICATIONS.has(method) || typeof listener !== 'function') throw new ModelError('invalid_request', 'Unsupported Codex notification.', 400)
      if (!listeners.has(method)) listeners.set(method, new Set())
      listeners.get(method).add(listener)
      return () => listeners.get(method)?.delete(listener)
    },
    close: () => close(connectionError(), false, true)
  }
}

/** Probe only the explicit executable; cancellation owns and terminates the probe. */
export function probeCodexVersion({ spawnProcess = spawn, executable, cwd, env, signal, timers = globalThis,
  onExit = () => {}, onShutdown = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let child
    let settled = false
    let exited = false
    let stopReason
    let termination
    let output = ''
    let timer
    function finish(error, version) {
      if (settled) return
      settled = true
      timers.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(version)
    }
    function confirmExit() {
      if (exited) return
      exited = true
      if (termination?.pending) {
        termination.pending = false
        timers.clearTimeout(termination.timer)
        termination.resolve()
      }
      onExit()
      if (stopReason) finish(stopReason)
    }
    function stop(error = new ModelError('cancelled', 'Codex connection was cancelled.', 499), retry = false) {
      stopReason ||= error
      timers.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (exited) { finish(stopReason); return Promise.resolve() }
      if (termination && (termination.pending || !retry)) return termination.promise
      const attempt = { pending: true }
      attempt.promise = new Promise((resolveExit, rejectExit) => { attempt.resolve = resolveExit; attempt.reject = rejectExit })
      attempt.promise.catch(() => {})
      termination = attempt
      function failed() {
        if (!attempt.pending || exited) return
        attempt.pending = false
        timers.clearTimeout(attempt.timer)
        attempt.reject(shutdownError())
        finish(shutdownError())
      }
      attempt.timer = timers.setTimeout(failed, 5000)
      if (!child) confirmExit()
      else { try { if (!child.kill('SIGKILL')) failed() } catch { failed() } }
      return attempt.promise
    }
    function abort() { stop() }
    onShutdown(() => stop(undefined, true))
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort, { once: true })
    timer = timers.setTimeout(() => stop(timeoutError()), RPC_TIMEOUT)
    try {
      child = spawnProcess(executable, ['--version'], { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      child.stdout.on('data', chunk => {
        output += chunk.toString()
        if (Buffer.byteLength(output) > 1024) stop(protocolError())
      })
      child.stdout.on('error', () => stop(connectionError()))
      child.on('error', error => {
        const safe = error.code === 'ENOENT'
          ? new ModelError('codex_missing', 'The configured Codex executable was not found.', 503) : connectionError()
        if (!child.pid) { confirmExit(); finish(safe) }
        else stop(safe)
      })
      child.on('exit', confirmExit)
      child.on('close', code => {
        confirmExit()
        const match = /^codex-cli (\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)\s*$/.exec(output)
        finish(stopReason || (code === 0 && match ? null : protocolError()), match?.[1])
      })
    } catch { if (!child) { confirmExit(); finish(connectionError()) } else stop(connectionError()) }
  })
}
