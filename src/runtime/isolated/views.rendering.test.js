import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Node has no WebGL context. Keep the real scene graph and exporter, replacing
// only the GPU boundary so rendering/shadow invalidations are observable.
const gpu = vi.hoisted(() => ({ renderers: [] }))
vi.mock('three', async original => {
  const three = await original()
  return { ...three, WebGLRenderer: class {
    constructor() {
      this.shadowMap = { autoUpdate: true, needsUpdate: false }; this.draws = 0; this.shadows = 0
      this.info = { autoReset: true, render: { calls: 0, triangles: 0 }, reset: () => { this.info.render = { calls: 0, triangles: 0 } } }
      gpu.renderers.push(this)
    }
    setPixelRatio() {} setSize() {} dispose() {} forceContextLoss() {}
    render(scene, camera) {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true)
      this.draws++
      this.info.reset()
      scene.traverseVisible(object => {
        if (!object.isMesh) return
        this.info.render.calls++
        this.info.render.triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1)
      })
      if (this.shadowMap.autoUpdate || this.shadowMap.needsUpdate) this.shadows++
      this.shadowMap.needsUpdate = false
    }
  } }
})

let THREE, createViews, views
const canvas = () => ({ getContext() {}, convertToBlob() {}, addEventListener() {}, removeEventListener() {} })
function asset(animated = false) {
  const root = new THREE.Group()
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
  return { root, hasAnimation: animated, tick: vi.fn(), dispose() {} }
}
beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  gpu.renderers.length = 0
  THREE = await import('three')
  ;({ createViews } = await import('./views.js'))
  vi.stubGlobal('FileReader', class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.() }) }
  })
})
afterEach(() => { views?.dispose(); views = null; vi.useRealTimers(); vi.unstubAllGlobals() })

describe('worker rendering invalidations', () => {
  it('leaves static frames and shadow maps untouched until camera or size changes', async () => {
    views = createViews(asset(), null, error => { throw error })
    await views.attach('main', canvas(), { width: 100, height: 100 })
    const renderer = gpu.renderers[0]
    expect(renderer.draws).toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(renderer.draws).toBe(1)
    views.setCamera('main', { position: [8, 4, 5], target: [0, 0, 0] })
    await vi.advanceTimersByTimeAsync(100)
    expect(renderer.draws).toBe(2)
    expect(renderer.shadows).toBe(1)
    views.resize('main', { width: 200, height: 100 })
    await vi.advanceTimersByTimeAsync(100)
    expect(renderer.draws).toBe(3)
    expect(renderer.shadows).toBe(1)
  })

  it.each(['animation', 'render hook'])('continues drawing and updating shadows for %s', async kind => {
    const model = asset(kind === 'animation')
    if (kind === 'render hook') model.root.children[0].onBeforeRender = () => {}
    views = createViews(model, null, error => { throw error })
    await views.attach('main', canvas(), { width: 100, height: 100 })
    await vi.advanceTimersByTimeAsync(100)
    expect(gpu.renderers[0].draws).toBeGreaterThan(3)
    expect(gpu.renderers[0].shadows).toBe(gpu.renderers[0].draws)
    if (kind === 'animation') expect(model.tick).toHaveBeenCalled()
  })
})

describe('preview GLB snapshot', () => {
  it('exports the attached layout, not helpers, the primary asset, or newly generated copies', async () => {
    let builds = 0
    views = createViews(asset(), async seed => {
      builds++
      const copy = asset()
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }), 2)
      mesh.name = `variant-${seed}`
      mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0, 0))
      copy.root.clear().add(mesh)
      return copy
    }, error => { throw error }, { seed: 10 })
    await views.attach('grid', canvas(), { width: 100, height: 100, batch: { gridSize: 2, spacing: 8, rotationJitter: 0, scaleJitter: 0 } })
    const bytes = await views.exportGLB('grid')
    const scene = (await new GLTFLoader().parseAsync(bytes, '')).scene
    const layout = scene.children[0]
    expect(layout.children.map(child => child.position.toArray())).toEqual([[-4, 0, -4], [-4, 0, 4], [4, 0, -4], [4, 0, 4]])
    const meshes = [], helpers = []
    scene.traverse(object => { if (object.isMesh) meshes.push(object); if (object.isLight || object.isLine) helpers.push(object) })
    expect(meshes).toHaveLength(4)
    expect(meshes.map(mesh => mesh.name)).toEqual(['variant-10', 'variant-11', 'variant-12', 'variant-13'])
    expect(meshes.every(mesh => mesh.isInstancedMesh && mesh.count === 2 && mesh.material.color.getHex() === 0xff0000)).toBe(true)
    const transform = new THREE.Matrix4()
    meshes[0].getMatrixAt(1, transform)
    expect(transform.elements[12]).toBe(3)
    expect(helpers).toEqual([])
    expect(builds).toBe(4)
    views.detach('grid')
    await expect(views.exportGLB('grid')).rejects.toThrow(/not attached/i)
  })
})

describe('batch optimization comparison', () => {
  it('switches and exports the same attached placements without rebuilding the source', async () => {
    let builds = 0
    views = createViews(asset(), async () => { builds++; return asset() }, error => { throw error }, { seed: 10 })
    await views.attach('grid', canvas(), { width: 100, height: 100, batch: { gridSize: 2, spacing: 8, rotationJitter: 0, scaleJitter: 0 } })
    const before = await views.exportGLB('grid')
    views.setCamera('grid', { position: [20, 14, 10], target: [0, 0, 0] })
    const result = views.setOptimization('grid', true)
    expect(result.enabled).toBe(true)
    expect(result.available).toBe(true)
    expect(result.before.calls - result.after.calls).toBe(3)
    expect(result.after.triangles).toBe(result.before.triangles)
    const optimized = (await new GLTFLoader().parseAsync(await views.exportGLB('grid'), '')).scene
    const meshes = []
    optimized.traverse(object => { if (object.isMesh) meshes.push(object) })
    expect(meshes).toHaveLength(1)
    expect(meshes[0].isInstancedMesh).toBe(true)
    expect(meshes[0].count).toBe(4)
    expect(views.setOptimization('grid', false).enabled).toBe(false)
    const restored = (await new GLTFLoader().parseAsync(await views.exportGLB('grid'), '')).scene
    const original = (await new GLTFLoader().parseAsync(before, '')).scene
    const positions = scene => { const values = []; scene.traverse(object => { if (object.isMesh) values.push(object.getWorldPosition(new THREE.Vector3()).toArray()) }); return values }
    expect(positions(restored)).toEqual(positions(original))
    expect(builds).toBe(4)
  })

  it('leaves animated layouts original and explains why optimization is unavailable', async () => {
    views = createViews(asset(), async () => asset(true), error => { throw error })
    await views.attach('grid', canvas(), { width: 100, height: 100, batch: { gridSize: 2 } })
    const result = views.setOptimization('grid', true)
    expect(result.enabled).toBe(false)
    expect(result.available).toBe(false)
    expect(result.report.reason).toMatch(/animat/i)
    const exported = (await new GLTFLoader().parseAsync(await views.exportGLB('grid'), '')).scene
    const meshes = []
    exported.traverse(object => { if (object.isMesh) meshes.push(object) })
    expect(meshes).toHaveLength(4)
  })

  it('validates optimization targets and boolean flags before touching a view', async () => {
    views = createViews(asset(), null, error => { throw error })
    await views.attach('main', canvas(), { width: 100, height: 100 })
    expect(() => views.setOptimization('main', true)).toThrow(/batch/i)
    expect(() => views.setOptimization('main', 'true')).toThrow(/boolean/i)
  })

  it('restores the original when a measurement cannot cross the protocol boundary', async () => {
    views = createViews(asset(), async () => asset(), error => { throw error })
    await views.attach('grid', canvas(), { width: 100, height: 100, batch: { gridSize: 2 } })
    const renderer = gpu.renderers[0]
    const render = renderer.render
    renderer.render = function (...args) { render.apply(this, args); this.info.render.calls = NaN }
    expect(() => views.setOptimization('grid', true)).toThrow()
    const exported = (await new GLTFLoader().parseAsync(await views.exportGLB('grid'), '')).scene
    const meshes = []
    exported.traverse(object => { if (object.isMesh) meshes.push(object) })
    expect(meshes).toHaveLength(4)
    renderer.render = render
    expect(views.setOptimization('grid', true).enabled).toBe(true)
  })

  it('releases cached snapshot instance buffers once when the batch view detaches', async () => {
    const copies = []
    views = createViews(asset(), async () => {
      const copy = { ...asset(), dispose: vi.fn() }
      copies.push(copy)
      return copy
    }, error => { throw error })
    await views.attach('grid', canvas(), { width: 100, height: 100, batch: { gridSize: 2 } })
    const renderer = gpu.renderers[0]
    const render = renderer.render
    const instances = new Map()
    renderer.render = function (scene, camera) {
      scene.traverse(object => {
        if (!object.isInstancedMesh || instances.has(object)) return
        const dispose = vi.fn()
        object.addEventListener('dispose', dispose)
        instances.set(object, dispose)
      })
      render.call(this, scene, camera)
    }
    views.setOptimization('grid', true)
    views.setOptimization('grid', false)
    expect(instances.size).toBe(1)
    views.detach('grid')
    views.detach('grid')
    for (const dispose of instances.values()) expect(dispose).toHaveBeenCalledTimes(1)
    for (const copy of copies) expect(copy.dispose).toHaveBeenCalledTimes(1)
  })
})
