/** Fit a host camera from serialized bounds without reading generated objects. */
export function getPreviewCamera(bounds, aspect = 1, batch) {
  let min = bounds?.min || [-1, -1, -1]
  let max = bounds?.max || [1, 1, 1]
  if (batch) {
    const scale = 1 + batch.scaleJitter
    const radius = Math.hypot(Math.max(Math.abs(min[0]), Math.abs(max[0])), Math.max(Math.abs(min[2]), Math.abs(max[2]))) * scale
    const halfGrid = (batch.gridSize - 1) * batch.spacing / 2
    min = [-halfGrid - radius, Math.min(min[1] * scale, min[1] * (1 - batch.scaleJitter)), -halfGrid - radius]
    max = [halfGrid + radius, Math.max(max[1] * scale, max[1] * (1 - batch.scaleJitter)), halfGrid + radius]
  }
  const target = min.map((value, index) => (value + max[index]) / 2)
  const directionLength = Math.hypot(5, 4, 5)
  const direction = [5, 4, 5].map(value => value / directionLength)
  const right = [Math.SQRT1_2, 0, -Math.SQRT1_2]
  const up = [-direction[1] * Math.SQRT1_2, Math.hypot(direction[0], direction[2]), -direction[1] * Math.SQRT1_2]
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)
  const tanVertical = Math.tan(Math.PI / 6)
  const tanHorizontal = tanVertical * Math.max(aspect, 0.01)
  let requiredDistance = 0
  // Fit the actual projected corners instead of applying a large diameter multiplier.
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const corner = [x, y, z].map((value, index) => value - target[index])
    requiredDistance = Math.max(requiredDistance, dot(corner, direction) + Math.max(Math.abs(dot(corner, right)) / tanHorizontal, Math.abs(dot(corner, up)) / tanVertical))
  }
  const distance = Math.max(3, requiredDistance * 1.15)
  return {
    target,
    position: target.map((value, index) => value + direction[index] * distance),
    distance,
  }
}

// At most one request per channel is in flight; intermediate updates are replaced.
function latestRequest(send, onError, canSend) {
  let pending = null
  let lastKey = null
  let sending = false
  const flush = async () => {
    if (sending || !pending || !canSend()) return
    const { value, key } = pending
    pending = null
    if (key === lastKey) return
    sending = true
    lastKey = key
    try { await send(value) }
    catch (error) { onError(error) }
    finally { sending = false; flush() }
  }
  return {
    push(value) { pending = { value, key: JSON.stringify(value) }; flush() },
    flush,
  }
}

const pendingDetaches = new WeakMap()

/** Lease one remote view until its attach and eventual detach have settled. */
export function createIsolatedViewSession(asset, viewId, canvas, options, onError) {
  const release = asset.retain?.()
  if (!pendingDetaches.has(asset)) pendingDetaches.set(asset, new Map())
  const slots = pendingDetaches.get(asset)
  const slot = options.batch ? 'batch' : 'primary'
  const previousDetach = slots.get(slot)
  let closed = false
  let failed = false
  let attached = false
  let attachStarted = false
  let closing = null
  const reportError = error => {
    if (closed || failed) return
    failed = true
    onError(error)
  }
  const canSend = () => attached && !closed && !failed
  const camera = latestRequest(value => asset.setCamera(viewId, value), reportError, canSend)
  const resize = latestRequest(value => asset.resizeView(viewId, value), reportError, canSend)
  let unsubscribe
  const ready = Promise.resolve(previousDetach).then(async () => {
    // Avoid exceeding the worker's primary + batch slots during a replacement.
    if (closed) return
    unsubscribe = asset.onError(reportError)
    if (failed) return
    attachStarted = true
    // This host-only gate closes synchronously, before an in-flight attach can
    // finish. A superseded worker must never overwrite the shared canvas.
    await asset.attachView(viewId, canvas, options, { shouldPresent: () => !closed && !failed })
    attached = true
    resize.flush()
    camera.flush()
  }).catch(reportError)

  return {
    ready,
    isReady: canSend,
    async exportGLB() {
      await ready
      if (!canSend()) throw new Error('Preview is not ready or has been closed.')
      return asset.exportViewGLB(viewId)
    },
    async setOptimization(enabled) {
      await ready
      if (!canSend()) throw new Error('Preview is not ready or has been closed.')
      return asset.setViewOptimization(viewId, enabled)
    },
    setCamera: value => { if (!closed && !failed) camera.push(value) },
    resize: value => { if (!closed && !failed) resize.push(value) },
    close() {
      if (closing) return closing
      closed = true
      unsubscribe?.()
      closing = ready.then(() => attachStarted && asset.detachView(viewId)).catch(() => {}).finally(() => {
        release?.()
        if (slots.get(slot) === closing) slots.delete(slot)
      })
      slots.set(slot, closing)
      return closing
    },
  }
}
