import { createBrokerDocument } from './broker.js'
import { createTransport } from './transport.js'
import { validateInput, validateMetadata, validateGLB, validateThumbnail, validateAnalysis, validateOptimization } from './protocol.js'

const abortError = () => new DOMException('Asset execution was cancelled.', 'AbortError')
const emptyReply = value => { if (value !== null) throw new Error('Invalid runtime acknowledgement.'); return undefined }

/** The browser's only generated-code entry point. There is no local fallback. */
export async function executeIsolated(code, options = {}) {
  const input = validateInput(code, options)
  if (options.signal?.aborted) throw abortError()
  if (typeof document === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('Isolated 3D execution requires a browser with Worker and OffscreenCanvas support. Please use a current Chrome or Edge browser.')
  }
  const { default: source } = await import('virtual:asset-worker-source')
  if (options.signal?.aborted) throw abortError()
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = 'Isolated asset runtime'
  iframe.hidden = true
  iframe.srcdoc = createBrokerDocument(crypto.randomUUID())
  const channel = new MessageChannel()
  const lifetime = new MessageChannel()
  let heartbeat
  const views = new Map()
  const rpc = createTransport(channel.port1, () => {
    clearInterval(heartbeat)
    lifetime.port1.postMessage('terminate')
    lifetime.port1.close()
    iframe.remove()
    views.clear()
  }, message => {
    const bitmap = message.bitmap
    if (!(bitmap instanceof ImageBitmap) || bitmap.width > 4096 || bitmap.height > 4096) {
      bitmap?.close?.()
      throw new Error('Invalid preview frame.')
    }
    const view = views.get(message.viewId)
    try {
      if (view && view.shouldPresent()) { view.canvas.width = bitmap.width; view.canvas.height = bitmap.height; view.context.transferFromImageBitmap(bitmap) }
      else bitmap.close()
    } catch (error) { bitmap.close(); throw error }
    rpc.notify('frameAck', { id: message.viewId })
  })
  const abort = () => rpc.close(abortError())
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Isolated runtime could not start. Browser sandbox support is required.')), 10000)
      const finish = error => {
        clearTimeout(timer)
        window.removeEventListener('message', ready)
        unsubscribe()
        error ? reject(error) : resolve()
      }
      const ready = event => {
        if (event.source !== iframe.contentWindow || event.data?.type !== 'asset-broker-ready') return
        iframe.contentWindow.postMessage({ type: 'connect', source }, '*', [channel.port2, lifetime.port2])
        finish()
      }
      const unsubscribe = rpc.onError(finish)
      window.addEventListener('message', ready)
      document.body.appendChild(iframe)
    })
    const timeout = Math.max(100, Math.min(options.timeout || 5000, 30000))
    const metadata = await rpc.request('init', { code, options: input }, [], timeout, validateMetadata)
    // A private port ping also detects infinite animation loops, including when no
    // user command is outstanding. Generated code cannot manufacture its replies.
    let pingPending = false
    heartbeat = setInterval(() => {
      // Export/optimization has its own bounded 30-second deadline, including synchronous
      // encoding. A shorter heartbeat must not terminate valid export work.
      if (pingPending || rpc.exporting) return
      pingPending = true
      rpc.request('ping', {}, [], 5000, emptyReply).catch(() => {}).finally(() => { pingPending = false })
    }, 1000)
    return {
      ...metadata, isIsolated: true, isCodeGenerated: true,
      async attachView(id, canvas, config, { shouldPresent = () => true } = {}) {
        if (views.has(id)) throw new Error('Preview view is already attached.')
        const context = canvas.getContext('bitmaprenderer')
        if (!context) throw new Error('This browser does not support ImageBitmap previews.')
        // Presentation callbacks are host-owned and are never sent to the worker.
        views.set(id, { canvas, context, shouldPresent })
        try { await rpc.request('attach', { id, config }, [], 15000, emptyReply) }
        catch (error) { views.delete(id); throw error }
      },
      resizeView: (id, config) => rpc.request('resize', { id, config }, [], 5000, emptyReply),
      setCamera: (id, camera) => rpc.request('camera', { id, camera }, [], 5000, emptyReply),
      detachView: id => { views.delete(id); return rpc.request('detach', { id }, [], 5000, emptyReply) },
      captureThumbnail: (width = 256, height = 256) => rpc.request('thumbnail', { width, height }, [], 10000, validateThumbnail),
      exportGLB: () => rpc.request('glb', {}, [], 30000, validateGLB),
      exportViewGLB: id => rpc.request('viewGLB', { id }, [], 30000, validateGLB),
      setViewOptimization: (id, enabled) => rpc.request('viewOptimization', { id, enabled }, [], 30000, validateOptimization),
      analyze: (analysisOptions = {}) => rpc.request('analyze', analysisOptions, [], 10000, validateAnalysis),
      onError: rpc.onError,
      dispose: () => rpc.close(),
    }
  } catch (error) { rpc.close(error); throw error }
  finally { options.signal?.removeEventListener('abort', abort) }
}
