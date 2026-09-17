import * as THREE from 'three'
import { createRNG } from '../seedRandom.js'
import { disposeObject } from '../assetDisposal.js'
import { createGLB } from '../glbExport.js'
import { canRenderOnDemand } from '../renderPolicy.js'
import { optimizeBatchSnapshot } from '../batchOptimizer.js'
import { validateOptimization } from './protocol.js'

// Import this module before evaluating generated factories. Never use their timers.
const scheduleInterval = globalThis.setInterval.bind(globalThis)
const cancelInterval = globalThis.clearInterval.bind(globalThis)
const now = globalThis.performance.now.bind(globalThis.performance)
const WorkerFileReader = globalThis.FileReader
const MAX_DIMENSION = 4096
const MAX_PIXELS = 4096 * 4096
const MAX_CAMERA_COORDINATE = 1_000_000

function boundedNumber(value, name, min, max, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? 'an integer' : 'finite'} between ${min} and ${max}.`)
  }
  return value
}

function normalizeBatch(batch) {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new Error('Invalid batch settings.')
  return {
    gridSize: boundedNumber(batch.gridSize ?? 3, 'batch.gridSize', 1, 5, true),
    spacing: boundedNumber(batch.spacing ?? 4, 'batch.spacing', 0, 100),
    rotationJitter: boundedNumber(batch.rotationJitter ?? 0.3, 'batch.rotationJitter', 0, 1),
    scaleJitter: boundedNumber(batch.scaleJitter ?? 0.2, 'batch.scaleJitter', 0, 0.5),
  }
}

/** Validate logical size and cap the actual drawing buffer to 16 megapixels. */
export function normalizeViewConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Invalid view config.')
  const width = boundedNumber(config.width, 'width', 1, MAX_DIMENSION, true)
  const height = boundedNumber(config.height, 'height', 1, MAX_DIMENSION, true)
  const requestedRatio = config.pixelRatio ?? 1
  if (!Number.isFinite(requestedRatio) || requestedRatio <= 0) throw new Error('pixelRatio must be positive and finite.')
  const pixelRatio = Math.max(1 / Math.min(width, height), Math.min(requestedRatio, 2, MAX_DIMENSION / width, MAX_DIMENSION / height, Math.sqrt(MAX_PIXELS / (width * height))))
  return { width, height, pixelRatio, ...(config.batch === undefined ? {} : { batch: normalizeBatch(config.batch) }),
    ...(config.camera === undefined ? {} : { camera: validateCamera(config.camera) }) }
}

/** Accept only finite, bounded host camera vectors, with a nonzero look direction. */
export function validateCamera(camera) {
  const valid = vector => Array.isArray(vector) && vector.length === 3 &&
    [...vector].every(value => Number.isFinite(value) && Math.abs(value) <= MAX_CAMERA_COORDINATE)
  if (!valid(camera?.position) || !valid(camera?.target) || camera.position.every((value, i) => value === camera.target[i])) {
    throw new Error('Camera requires distinct position/target vectors within +/-1000000.')
  }
  return { position: [...camera.position], target: [...camera.target] }
}

/** Produce independent variant seeds and reproducible wrapper transforms. */
export function createBatchPlacements(batch, seed) {
  const { gridSize, spacing, rotationJitter, scaleJitter } = normalizeBatch(batch)
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(seed + gridSize * gridSize - 1)) throw new Error('Invalid batch seed.')
  const rng = createRNG(seed)
  const offset = (gridSize - 1) * spacing / 2
  const placements = []
  for (let x = 0; x < gridSize; x++) for (let z = 0; z < gridSize; z++) {
    placements.push({
      seed: seed + placements.length,
      x: x * spacing - offset,
      z: z * spacing - offset,
      rotation: rotationJitter ? (rng.random() - 0.5) * rotationJitter * Math.PI * 2 : 0,
      scale: 1 + (rng.random() - 0.5) * scaleJitter * 2,
    })
  }
  return placements
}

/** Fit actual bounds (including batch wrappers) using the narrower camera FOV. */
export function fitCameraToObject(root, camera) {
  const bounds = new THREE.Box3().setFromObject(root)
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  if (![...center.toArray(), ...size.toArray()].every(Number.isFinite)) throw new Error('Asset has non-finite camera bounds.')
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2
  const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect))
  const radius = Math.max(size.length() / 2, 0.5)
  const distance = Math.max(3, radius / Math.sin(limitingFov) * 1.2)
  camera.position.copy(center).add(new THREE.Vector3(5, 4, 5).normalize().multiplyScalar(distance))
  validateCamera({ position: camera.position.toArray(), target: center.toArray() })
  camera.near = Math.max(0.01, distance / 10000)
  camera.far = Math.max(1000, distance + radius * 4)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
  return center
}

function setRendererSize(renderer, config) {
  // Reset first: setPixelRatio itself resizes in r169, so avoid an oversized
  // intermediate buffer when moving between large and high-DPI view sizes.
  renderer.setPixelRatio(1)
  renderer.setSize(config.width, config.height, false)
  renderer.setPixelRatio(config.pixelRatio)
}

function addEnvironment(view) {
  const { scene, helpers } = view
  const batch = !!view.config.batch
  scene.background = new THREE.Color(batch ? 0x1a1a2e : 0x1a1a1a)
  scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.position.set(5, 10, 5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { near: 0.5, far: 100, left: -20, right: 20, top: 20, bottom: -20 })
  scene.add(sun)
  view.sun = sun
  const fill = new THREE.DirectionalLight(0xffd97d, 0.3)
  fill.position.set(-5, 3, -5)
  scene.add(fill)
  const extent = batch ? Math.max(40, view.config.batch.gridSize * view.config.batch.spacing + 10) : 20
  const grid = new THREE.GridHelper(extent, Math.min(100, Math.ceil(extent)), 0x444444, 0x2a2a2a)
  grid.position.y = -0.01
  helpers.push(grid)
  scene.add(grid)
  const axes = new THREE.AxesHelper(2)
  axes.position.set(-extent / 2 + 1, 0, -extent / 2 + 1)
  helpers.push(axes)
  scene.add(axes)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), new THREE.ShadowMaterial({ opacity: 0.3 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  helpers.push(ground)
  scene.add(ground)
}

function blobToDataURL(blob) {
  if (!WorkerFileReader) throw new Error('Worker FileReader is unavailable for PNG capture.')
  return new Promise((resolve, reject) => {
    const reader = new WorkerFileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/png;base64,')) resolve(reader.result)
      else reject(new Error('Thumbnail encoding did not produce PNG data.'))
    }
    reader.onerror = () => reject(reader.error || new Error('Could not read thumbnail PNG.'))
    reader.onabort = () => reject(new Error('Thumbnail PNG read was aborted.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Own worker renderers, helpers and variants, but never dispose the primary asset.
 * Import before factory execution. Pass its original seed as the fourth argument.
 * onFatal must notify the host and stop the runtime; a host deadline handles hangs.
 */
export function createViews(asset, createVariant, onFatal, { seed = asset?.seed ?? 12345, presentFrame } = {}) {
  if (!asset?.root?.isObject3D) throw new Error('Views require an actual asset root.')
  if (!Number.isSafeInteger(seed)) throw new Error('Invalid view seed.')
  const views = new Map()
  const renderers = []
  const ownedRoots = new WeakSet([asset.root])
  const releasedCopies = new WeakSet()
  const pendingTicks = new WeakSet()
  let disposed = false
  let failed = false
  let timer = null
  let elapsed = 0
  let lastTime = 0
  let capturing = false

  function present(view) {
    if (!presentFrame || view.framePending) return
    const bitmap = view.canvas.transferToImageBitmap()
    view.framePending = true
    try { presentFrame(view.id, bitmap) }
    catch (error) { bitmap.close(); throw error }
  }

  function stopTimer() {
    if (timer !== null) cancelInterval(timer)
    timer = null
  }

  function fatal(error) {
    if (failed) return
    failed = true
    stopTimer()
    try { onFatal?.(error instanceof Error ? error : new Error(String(error))) }
    catch { /* Reporting must not create a second unhandled worker exception. */ }
  }

  function cleanup(operation) {
    try { operation() } catch (error) { fatal(error) }
  }

  function releaseCopy(copy) {
    if (!copy || typeof copy !== 'object' || copy === asset || copy.root === asset.root || releasedCopies.has(copy)) return
    releasedCopies.add(copy)
    cleanup(() => copy.root?.removeFromParent?.())
    cleanup(() => {
      const result = typeof copy.dispose === 'function' ? copy.dispose() : disposeObject(copy.root)
      if (result?.then) Promise.resolve(result).catch(fatal)
    })
  }

  function releaseView(view) {
    if (view.closed) return
    view.closed = true
    if (views.get(view.id) === view) views.delete(view.id)
    cleanup(() => view.optimization?.dispose())
    if (!view.config.batch && asset.root.parent === view.scene) cleanup(() => view.scene.remove(asset.root))
    for (const copy of view.copies.splice(0)) releaseCopy(copy)
    for (const helper of view.helpers.splice(0)) cleanup(() => disposeObject(helper))
    cleanup(() => view.sun?.shadow.dispose())
    if (view.renderer) {
      // Keep the context alive for the next preview, but not its old scene.
      cleanup(() => view.renderer.renderLists.dispose())
      view.rendererSlot.inUse = false
      view.renderer = null
      view.rendererSlot = null
    }
    view.canvas = null
    cleanup(() => view.scene.clear())
    if (![...views.values()].some(entry => entry.ready)) stopTimer()
  }

  function assertLive() {
    if (disposed) throw new Error('Views have been disposed.')
    if (failed) throw new Error('View runtime has failed.')
  }

  function acquireRenderer(view, canvas, settings) {
    let slot = renderers.find(entry => !entry.inUse)
    if (!slot) {
      if (renderers.length >= 2) throw new Error('At most two renderers may be allocated.')
      // Bound even the constructor's initial drawing buffer allocation.
      canvas.width = settings.width
      canvas.height = settings.height
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
      slot = { renderer, canvas, scene: view.scene, camera: new THREE.PerspectiveCamera(), inUse: false, sizeKey: null,
        contextLost: () => fatal(new Error('Worker view WebGL context was lost.')) }
      renderers.push(slot)
      canvas.addEventListener('webglcontextlost', slot.contextLost)
    }
    slot.inUse = true
    view.rendererSlot = slot
    view.renderer = slot.renderer
    view.canvas = slot.canvas
    // r169 caches transmission targets by scene/camera identity. Retain both
    // identities, reset their settings, and move only this view's fresh content.
    if (view.scene !== slot.scene) {
      // Scene.copy in r169 skips null fields instead of clearing old values.
      slot.scene.background = slot.scene.environment = slot.scene.fog = slot.scene.overrideMaterial = null
      slot.scene.copy(view.scene, false)
      slot.scene.onBeforeRender = view.scene.onBeforeRender
      slot.scene.onAfterRender = view.scene.onAfterRender
      slot.scene.add(...view.scene.children)
      view.scene = slot.scene
    }
    view.camera = slot.camera
    view.camera.clear()
    delete view.camera.viewport
    view.camera.copy(new THREE.PerspectiveCamera(60, settings.width / settings.height, 0.1, 1000), false)
    const sizeKey = JSON.stringify([settings.width, settings.height, settings.pixelRatio])
    if (sizeKey !== slot.sizeKey) {
      setRendererSize(slot.renderer, settings)
      slot.sizeKey = sizeKey
    }
  }

  function active(view) {
    return !disposed && !failed && !view.closed && views.get(view.id) === view
  }

  function getView(id) {
    assertLive()
    const view = views.get(id)
    if (!view?.ready) throw new Error(`View is not attached: ${id}`)
    return view
  }

  function tick(copy, delta) {
    if (copy.hasAnimation === false || pendingTicks.has(copy)) return
    const callback = typeof copy.tick === 'function' ? copy.tick : copy.update
    if (typeof callback !== 'function') return
    const result = callback.call(copy, elapsed, delta)
    if (result?.then) {
      pendingTicks.add(copy)
      Promise.resolve(result).then(() => pendingTicks.delete(copy), error => { pendingTicks.delete(copy); fatal(error) })
    }
  }

  function frame() {
    if (disposed || failed || capturing) return
    try {
      const time = now()
      const delta = Math.max(0, Math.min((time - lastTime) / 1000, 0.1))
      elapsed += Math.max(0, (time - lastTime) / 1000)
      lastTime = time
      for (const view of views.values()) {
        if (!view.ready) continue
        if (view.config.batch) view.copies.forEach(copy => tick(copy, delta))
        else tick(asset, delta)
        if (!active(view)) return
        if (view.onDemand && !view.dirty) continue
        view.renderer.render(view.scene, view.camera)
        // A pending bitmap belongs to an older frame. Keep this invalidation
        // until a freshly drawn frame can actually be presented.
        view.dirty = !!view.framePending
        present(view)
      }
    } catch (error) { fatal(error) }
  }

  async function attach(id, canvas, config) {
    assertLive()
    if (typeof id !== 'string' || !id.length || id.length > 128) throw new Error('Invalid view id.')
    if (views.has(id)) throw new Error('View id is already attached.')
    if (views.size >= 2) throw new Error('At most two views may be attached.')
    const settings = normalizeViewConfig(config)
    if (!canvas || typeof canvas.getContext !== 'function' || typeof canvas.convertToBlob !== 'function') throw new Error('View requires a transferred OffscreenCanvas.')
    if ([...views.values()].some(view => view.canvas === canvas)) throw new Error('Canvas is already attached.')
    if (!settings.batch && ([...views.values()].some(view => !view.config.batch) || asset.root.parent)) {
      throw new Error('The primary asset can belong to only one view.')
    }
    if (settings.batch && typeof createVariant !== 'function') throw new Error('Batch views require a variant factory.')
    const view = { id, canvas, config: settings, scene: new THREE.Scene(), copies: [], helpers: [], closed: false, ready: false }
    views.set(id, view)
    try {
      if (settings.batch) {
        view.content = new THREE.Group()
        view.scene.add(view.content)
        for (const placement of createBatchPlacements(settings.batch, seed)) {
          const copy = await createVariant(placement.seed)
          if (!copy?.root?.isObject3D || typeof copy.dispose !== 'function') {
            if (!ownedRoots.has(copy?.root) && !copy?.root?.parent) releaseCopy(copy)
            throw new Error('Variant must return an actual asset with root and dispose.')
          }
          if (ownedRoots.has(copy.root) || copy.root.parent) throw new Error('Batch variants must have distinct, unparented roots.')
          ownedRoots.add(copy.root)
          if (!active(view)) { releaseCopy(copy); return }
          view.copies.push(copy)
          const wrapper = new THREE.Group()
          wrapper.position.set(placement.x, 0, placement.z)
          wrapper.rotation.y = placement.rotation
          wrapper.scale.setScalar(placement.scale)
          wrapper.add(copy.root)
          view.content.add(wrapper)
          copy.root.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true } })
        }
      } else {
        view.content = asset.root
        view.scene.add(asset.root)
      }
      if (!active(view)) return
      // This canvas was created in the worker, never transferred from the DOM.
      // Only finished ImageBitmaps cross the opaque-origin boundary for display.
      acquireRenderer(view, canvas, settings)
      view.renderer.shadowMap.enabled = true
      view.renderer.shadowMap.type = THREE.PCFSoftShadowMap
      view.onDemand = (settings.batch ? view.copies : [asset]).every(canRenderOnDemand)
      view.renderer.shadowMap.autoUpdate = !view.onDemand
      view.renderer.shadowMap.needsUpdate = true
      view.renderer.toneMapping = THREE.ACESFilmicToneMapping
      view.renderer.toneMappingExposure = 1.2
      addEnvironment(view)
      view.target = fitCameraToObject(view.content, view.camera)
      if (settings.camera) {
        view.camera.position.fromArray(settings.camera.position)
        view.target.fromArray(settings.camera.target)
        view.camera.lookAt(view.target)
        view.camera.far = Math.max(view.camera.far, view.camera.position.distanceTo(view.target) * 4)
        view.camera.updateProjectionMatrix()
      }
      view.renderer.render(view.scene, view.camera)
      present(view)
      view.dirty = false
      view.ready = true
      if (timer === null) {
        lastTime = now()
        timer = scheduleInterval(frame, 1000 / 60)
      }
    } catch (error) {
      const wasActive = !disposed && !view.closed && views.get(id) === view
      releaseView(view)
      if (wasActive) { fatal(error); throw error }
    }
  }

  function resize(id, config) {
    const view = getView(id)
    const settings = normalizeViewConfig({ ...config, pixelRatio: config?.pixelRatio ?? view.config.pixelRatio })
    try {
      setRendererSize(view.renderer, settings)
      view.rendererSlot.sizeKey = JSON.stringify([settings.width, settings.height, settings.pixelRatio])
      view.config = { ...settings, ...(view.config.batch ? { batch: view.config.batch } : {}) }
      view.camera.aspect = settings.width / settings.height
      view.camera.updateProjectionMatrix()
      view.dirty = true
    } catch (error) { fatal(error); throw error }
  }

  function setCamera(id, camera) {
    const view = getView(id)
    const { position, target } = validateCamera(camera)
    view.camera.position.fromArray(position)
    view.target.fromArray(target)
    view.camera.lookAt(view.target)
    // Host OrbitControls can move farther than the initial fit's clipping range.
    view.camera.far = Math.max(view.camera.far, view.camera.position.distanceTo(view.target) * 4)
    view.camera.updateProjectionMatrix()
    view.dirty = true
  }

  function selectContent(view, optimized) {
    view.content.removeFromParent()
    view.optimization?.root?.removeFromParent()
    view.optimized = optimized && !!view.optimization?.root
    view.scene.add(view.optimized ? view.optimization.root : view.content)
    view.renderer.shadowMap.needsUpdate = true
    view.dirty = true
  }

  function measure(view) {
    // r169 resets render.info AFTER shadows, but BEFORE transmission passes.
    // Report those scene-render counts at the same studio/camera/resolution.
    const { renderer } = view
    const autoReset = renderer.info.autoReset
    renderer.info.autoReset = true
    try {
      renderer.render(view.scene, view.camera)
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
    } finally { renderer.info.autoReset = autoReset }
  }

  function setOptimization(id, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Optimization flag must be a boolean.')
    const view = getView(id)
    if (!view.config.batch) throw new Error('Optimization requires a batch view.')
    if (capturing) throw new Error('A preview capture is already in progress.')
    capturing = true
    try {
      if (!view.optimization) {
        view.optimization = optimizeBatchSnapshot(view.content, { hasAnimation: view.copies.some(copy => copy.hasAnimation !== false) })
        selectContent(view, false)
        const before = measure(view)
        let after = null
        if (view.optimization.root) { selectContent(view, true); after = measure(view) }
        view.optimizationCounts = { before, after }
      }
      selectContent(view, enabled)
      // Validate inside the rollback boundary: rejected counts must not leave
      // an optimized view selected while the host still believes it is original.
      return validateOptimization({ enabled: view.optimized, available: !!view.optimization.root,
        ...view.optimizationCounts, report: view.optimization.report })
    } catch (error) {
      selectContent(view, false)
      view.optimization?.dispose()
      view.optimization = null
      throw error
    } finally { capturing = false }
  }

  async function exportGLB(id) {
    const view = getView(id)
    if (!view.config.batch) throw new Error('Preview GLB export requires a batch view.')
    if (capturing) throw new Error('A preview capture is already in progress.')
    capturing = true
    try {
      // Export the owned content only: never include studio lights/helpers or
      // re-run generated source. Pause ticks while the detached snapshot encodes.
      return await createGLB(view.optimized ? view.optimization.root : view.content)
    } finally { capturing = false }
  }

  async function captureThumbnail(width = 256, height = 256) {
    assertLive()
    boundedNumber(width, 'thumbnail width', 1, 512, true)
    boundedNumber(height, 'thumbnail height', 1, 512, true)
    const view = [...views.values()].find(entry => entry.ready && !entry.config.batch)
    if (!view) throw new Error('Thumbnail capture requires an attached primary view.')
    if (capturing) throw new Error('Thumbnail capture is already in progress.')
    capturing = true
    const originalCamera = view.camera.clone()
    const originalTarget = view.target.clone()
    let png
    try {
      try {
        setRendererSize(view.renderer, { width, height, pixelRatio: 1 })
        view.camera.aspect = width / height
        view.target.copy(fitCameraToObject(view.content, view.camera))
        view.renderer.render(view.scene, view.camera)
        view.dirty = true
        // Do not resize/re-render this WebGL canvas until readback completes.
        // Commands are serialized by the worker bridge and frame() pauses here.
        png = await view.canvas.convertToBlob({ type: 'image/png' })
      } finally {
        view.camera.copy(originalCamera)
        view.target.copy(originalTarget)
        setRendererSize(view.renderer, view.config)
        view.renderer.render(view.scene, view.camera)
      }
      const result = await blobToDataURL(png)
      assertLive()
      return result
    } catch (error) { fatal(error); throw error }
    finally { capturing = false }
  }

  return {
    attach, resize, setCamera, captureThumbnail, exportGLB, setOptimization,
    acknowledge(id) { const view = views.get(id); if (view) view.framePending = false },
    detach(id) { const view = views.get(id); if (view) releaseView(view) },
    dispose() {
      if (disposed) return
      disposed = true
      stopTimer()
      for (const view of [...views.values()]) releaseView(view)
      for (const slot of renderers.splice(0)) {
        cleanup(() => slot.canvas.removeEventListener('webglcontextlost', slot.contextLost))
        cleanup(() => slot.renderer.dispose())
      }
    },
  }
}
