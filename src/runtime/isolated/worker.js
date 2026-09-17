import * as THREE from 'three'
import { createGLB } from '../glbExport.js'
import { executeFactory } from './factory.js'
import { evaluateCreativeAsset } from '../creativeCritic.js'
import { generateInstanceSpec } from '../InstanceSpecAnalysis.js'
import { createViews } from './views.js'
import { validateMetadata, validateAnalysis, validateOptimization, MAX_BINARY } from './protocol.js'

const decodeImage = globalThis.createImageBitmap?.bind(globalThis)
const stringify = JSON.stringify.bind(JSON)

/** CSP and the opaque origin are the security boundary. Removing these APIs is
 * defense in depth and gives unsupported operations an immediate useful error. */
function restrictAmbientCapabilities() {
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel', 'importScripts']) {
    Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false })
  }
}

async function prepareThree(textures) {
  const images = new Map()
  for (const data of new Set(Object.values(textures))) {
    const [header, encoded] = data.split(',')
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
    const image = await decodeImage(new Blob([bytes], { type: header.slice(5, header.indexOf(';')) }), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    if (image.width > 4096 || image.height > 4096 || image.width * image.height > 16_000_000) { image.close(); throw new Error('Supplied texture exceeds the 4096-axis / 16M-pixel limit.') }
    images.set(data, image)
  }
  class TextureLoader extends THREE.Loader {
    load(data, onLoad) {
      if (!images.has(data)) throw new Error('TextureLoader can only load the supplied texture inputs. External URLs and imports are unavailable.')
      const texture = new THREE.Texture(images.get(data))
      texture.flipY = false
      texture.needsUpdate = true
      if (onLoad) onLoad(texture)
      return texture
    }
    async loadAsync(data) { return this.load(data) }
  }
  return { ...THREE, TextureLoader }
}

// The bootstrap listener is removed before any generated code can run. The
// MessagePort and bound sender remain in module closures, not global properties.
addEventListener('message', function connect(event) {
  const port = event.data?.port
  if (!(port instanceof MessagePort)) return
  removeEventListener('message', connect)
  restrictAmbientCapabilities()
  const send = port.postMessage.bind(port)
  const fatal = error => send({ fatal: true, error: String(error?.message || error).slice(0, 2000) })
  let asset, source, inputs, three, views
  let queue = Promise.resolve()
  const handle = async ({ id, type, payload }) => {
    if (!Number.isSafeInteger(id) || typeof type !== 'string' || !payload || typeof payload !== 'object') return
    try {
      let value = null
      let transfer = []
      if (type === 'ready') {
        // A private-port acknowledgement after the trusted bundle and its
        // capability restrictions are installed; no generated code runs here.
        if (asset) throw new Error('Runtime is already initialized.')
      } else if (type === 'init') {
        if (asset) throw new Error('Runtime is already initialized.')
        source = payload.code
        inputs = payload.options
        three = await prepareThree(inputs.textures)
        asset = await executeFactory(source, inputs, three)
        const { isProcedural, usesAddons, usedAddons, hasAnimation, triangleCount, runtimeSignals } = asset
        value = validateMetadata({ isProcedural, usesAddons, usedAddons, hasAnimation, triangleCount, runtimeSignals,
          criticEvaluation: evaluateCreativeAsset({ asset, code: source, prompt: inputs.prompt, assetFamily: inputs.assetFamily }) })
        views = createViews(asset, seed => executeFactory(source, { ...inputs, seed }, three), fatal, {
          seed: inputs.seed,
          presentFrame: (viewId, bitmap) => send({ type: 'frame', viewId, bitmap }, [bitmap]),
        })
      } else {
        if (!asset) throw new Error('Runtime has not been initialized.')
        switch (type) {
          case 'ping': break
          case 'attach': await views.attach(payload.id, new OffscreenCanvas(1, 1), payload.config); break
          case 'resize': views.resize(payload.id, payload.config); break
          case 'camera': views.setCamera(payload.id, payload.camera); break
          case 'viewOptimization': value = validateOptimization(views.setOptimization(payload.id, payload.enabled)); break
          case 'detach': views.detach(payload.id); break
          case 'thumbnail': value = await views.captureThumbnail(payload.width, payload.height); break
          case 'viewGLB':
          case 'glb': {
            value = type === 'viewGLB' ? await views.exportGLB(payload.id) : await createGLB(asset.root)
            if (!(value instanceof ArrayBuffer) || value.byteLength > MAX_BINARY) throw new Error('GLB export exceeds the 64 MB limit.')
            transfer = [value]
            break
          }
          case 'analyze':
            value = validateAnalysis(await generateInstanceSpec(source, { ...inputs, name: payload.name || 'Generated Asset', prompt: payload.prompt || inputs.prompt }, asset))
            break
          default: throw new Error('Unsupported runtime command.')
        }
      }
      if (type === 'init' || type === 'analyze') value = JSON.parse(stringify(value))
      send({ id, ok: true, value }, transfer)
    } catch (error) { send({ id, ok: false, error: String(error?.message || error).slice(0, 2000) }) }
  }
  port.onmessage = ({ data }) => {
    // Liveness measures the worker event loop, not whether an asynchronous image
    // encoder/export has finished. Every queued command has its own deadline.
    if (data?.type === 'frameAck') {
      views?.acknowledge(data.payload?.id)
    } else if (data?.type === 'ping' && Number.isSafeInteger(data.id) && asset) {
      send({ id: data.id, ok: true, value: null })
    } else queue = queue.then(() => handle(data)).catch(fatal)
  }
})
