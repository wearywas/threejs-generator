/** Private-port RPC with host-owned deadlines. No generated callbacks cross it. */
export function createTransport(port, terminate, onEvent = () => {}) {
  let serial = 0
  let closed = null
  let exporting = null
  let waiting = 0
  const pending = new Map()
  const listeners = new Set()
  const close = (error = new Error('Asset runtime was disposed.')) => {
    if (closed) return
    closed = error
    port.close()
    terminate()
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
    pending.clear()
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
    if (!data || !Number.isSafeInteger(data.id) || !pending.has(data.id)) return
    const request = pending.get(data.id)
    try {
      if (typeof data.ok !== 'boolean') throw new Error('Invalid runtime response.')
      if (!data.ok && (typeof data.error !== 'string' || data.error.length > 2000)) throw new Error('Invalid runtime error response.')
      const result = data.ok ? request.validate(data.value) : null
      clearTimeout(request.timer)
      pending.delete(data.id)
      if (data.ok) request.resolve(result)
      else request.reject(new Error(data.error))
    } catch (error) { close(error) }
  }
  port.onmessageerror = () => close(new Error('Unreadable runtime response.'))
  function request(type, payload = {}, transfer = [], timeout = 5000, validate = value => value) {
    if (closed) return Promise.reject(closed)
    if (pending.size + waiting >= 32) return Promise.reject(new Error('Too many pending runtime requests.'))
    // The worker serializes commands. Do not start a short camera/detach/etc.
    // deadline while a longer export is still occupying that queue.
    if (exporting && type !== 'ping') {
      waiting++
      const resume = () => { waiting--; return request(type, payload, transfer, timeout, validate) }
      return exporting.then(resume, resume)
    }
    const result = new Promise((resolve, reject) => {
      const id = ++serial
      const timer = setTimeout(() => close(new Error(`Asset ${type} timed out; the isolated worker was stopped.`)), timeout)
      pending.set(id, { resolve, reject, timer, validate })
      try { port.postMessage({ id, type, payload }, transfer) } catch (error) { close(error) }
    })
    if (type === 'glb' || type === 'viewGLB' || type === 'viewOptimization') {
      exporting = result
      const settled = () => { if (exporting === result) exporting = null }
      result.then(settled, settled)
    }
    return result
  }
  return {
    close,
    get exporting() { return exporting !== null },
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
