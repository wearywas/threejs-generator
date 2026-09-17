/** Private-port RPC with host-owned deadlines. No generated callbacks cross it. */
export function createTransport(port, terminate, onEvent = () => {}) {
  let serial = 0
  let closed = null
  let activeId = null
  const pending = new Map()
  const listeners = new Set()
  const close = (error = new Error('Asset runtime was disposed.')) => {
    if (closed) return
    closed = error
    port.close()
    terminate()
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
    pending.clear()
    activeId = null
    for (const listener of listeners) listener(error)
    listeners.clear()
  }
  port.onmessage = ({ data }) => {
    if (data?.type === 'frame') {
      try { onEvent(data) } catch (error) { close(error) }
      return
    }
    if (data?.fatal === true && typeof data.error === 'string' && data.error.length <= 2000) {
      close(new Error(`Isolated preview stopped: ${data.error}`))
      return
    }
    if (!data || !Number.isSafeInteger(data.id) || data.id !== activeId) return
    const request = pending.get(data.id)
    try {
      if (typeof data.ok !== 'boolean') throw new Error('Invalid runtime response.')
      if (!data.ok && (typeof data.error !== 'string' || data.error.length > 2000)) throw new Error('Invalid runtime error response.')
      const result = data.ok ? request.validate(data.value) : null
      clearTimeout(request.timer)
      pending.delete(data.id)
      activeId = null
      if (data.ok) request.resolve(result)
      else request.reject(new Error(data.error))
      dispatchNext()
    } catch (error) { close(error) }
  }
  port.onmessageerror = () => close(new Error('Unreadable runtime response.'))
  function dispatchNext() {
    if (closed || activeId !== null || pending.size === 0) return
    const [id, next] = pending.entries().next().value
    activeId = id
    next.timer = setTimeout(() => close(new Error(`Asset ${next.type} timed out; the isolated worker was stopped.`)), next.timeout)
    try { port.postMessage({ id, type: next.type, payload: next.payload }, next.transfer) } catch (error) { close(error) }
  }
  function request(type, payload = {}, transfer = [], timeout = 5000, validate = value => value) {
    if (closed) return Promise.reject(closed)
    if (pending.size >= 32) return Promise.reject(new Error('Too many pending runtime requests.'))
    // Match the worker's command queue on the host: each deadline begins when
    // work is dispatched, not while it waits behind another bounded operation.
    // Include pings so an already in-flight heartbeat cannot time out behind
    // synchronous preview construction or export.
    return new Promise((resolve, reject) => {
      const id = ++serial
      pending.set(id, { resolve, reject, type, payload, transfer, timeout, validate, timer: null })
      dispatchNext()
    })
  }
  return {
    close,
    get busy() { return pending.size > 0 },
    notify(type, payload) {
      if (!closed) port.postMessage({ id: 0, type, payload })
    },
    onError(listener) {
      if (closed) listener(closed)
      else listeners.add(listener)
      return () => listeners.delete(listener)
    },
    request,
  }
}
