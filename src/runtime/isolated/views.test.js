import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createBatchPlacements, createViews, fitCameraToObject, normalizeViewConfig, validateCamera } from './views.js'

describe('view limits', () => {
  it('validates and carries the initial camera so the first frame does not use the default fit', () => {
    const camera = { position: [10, 2, -5], target: [1, 0, 0] }
    expect(normalizeViewConfig({ width: 100, height: 100, camera }).camera).toEqual(camera)
    expect(() => normalizeViewConfig({ width: 100, height: 100, camera: { ...camera, position: [Infinity, 0, 0] } })).toThrow(/camera/i)
  })
  it('keeps wide high-DPI frame axes within the host image limit', () => {
    const config = normalizeViewConfig({ width: 3000, height: 1000, pixelRatio: 2 })
    expect(Math.floor(config.width * config.pixelRatio)).toBeLessThanOrEqual(4096)
    expect(Math.floor(config.height * config.pixelRatio)).toBeLessThanOrEqual(4096)
  })
  it('caps physical pixels, not only CSS dimensions or device pixel ratio', () => {
    const config = normalizeViewConfig({ width: 4096, height: 4096, pixelRatio: 2 })
    expect(config.width).toBe(4096)
    expect(config.height).toBe(4096)
    expect(config.width * config.height * config.pixelRatio ** 2).toBeLessThanOrEqual(4096 ** 2)
    expect(normalizeViewConfig({ width: 800, height: 600, pixelRatio: 3 }).pixelRatio).toBe(2)
  })

  it.each([0, -1, 4097, 1.5, NaN, Infinity, '100'])('rejects invalid dimension %s', width => {
    expect(() => normalizeViewConfig({ width, height: 100 })).toThrow(/width/i)
  })

  it.each([0, -1, NaN, Infinity, '2'])('rejects invalid pixel ratio %s', pixelRatio => {
    expect(() => normalizeViewConfig({ width: 100, height: 100, pixelRatio })).toThrow(/pixelRatio/i)
  })

  it('rejects malformed camera vectors and coincident position/target', () => {
    for (const position of [[Infinity, 0, 1], [1e7, 0, 1], [0, 1], ['1', 0, 1], [0, 0, 0], [5, , 5]]) {
      expect(() => validateCamera({ position, target: [0, 0, 0] })).toThrow(/camera/i)
    }
    expect(validateCamera({ position: [5, 4, 5], target: [0, 1, 0] })).toEqual({ position: [5, 4, 5], target: [0, 1, 0] })
  })
})

describe('seeded batch placements', () => {
  it('places centered copies with sequential seeds and honors zero jitter', () => {
    expect(createBatchPlacements({ gridSize: 2, spacing: 4, rotationJitter: 0, scaleJitter: 0 }, 100)).toEqual([
      { seed: 100, x: -2, z: -2, rotation: 0, scale: 1 },
      { seed: 101, x: -2, z: 2, rotation: 0, scale: 1 },
      { seed: 102, x: 2, z: -2, rotation: 0, scale: 1 },
      { seed: 103, x: 2, z: 2, rotation: 0, scale: 1 },
    ])
  })

  it('makes repeatable seed-dependent jitter within the existing controls', () => {
    const batch = { gridSize: 5, spacing: 10, rotationJitter: 0.3, scaleJitter: 0.2 }
    const placements = createBatchPlacements(batch, 12345)
    expect(placements).toHaveLength(25)
    expect(placements).toEqual(createBatchPlacements(batch, 12345))
    expect(placements).not.toEqual(createBatchPlacements(batch, 12346))
    for (const placement of placements) {
      expect(Math.abs(placement.rotation)).toBeLessThanOrEqual(0.3 * Math.PI)
      expect(placement.scale).toBeGreaterThanOrEqual(0.8)
      expect(placement.scale).toBeLessThanOrEqual(1.2)
    }
  })

  it.each([{ gridSize: 6 }, { gridSize: 1.5 }, { spacing: Infinity }, { spacing: -1 }, { rotationJitter: 2 }, { scaleJitter: 1 }])('rejects unbounded batch settings %j', batch => {
    expect(() => createBatchPlacements(batch, 1)).toThrow()
  })
})

describe('camera fitting with real Three geometry', () => {
  it('fits every corner of offset bounds in both landscape and portrait viewports', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 8), new THREE.MeshBasicMaterial())
    mesh.position.set(30, 8, -15)
    root.add(mesh)
    const box = new THREE.Box3().setFromObject(root)
    for (const aspect of [2, 0.25]) {
      const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000)
      const target = fitCameraToObject(root, camera)
      expect(target.toArray()).toEqual([30, 8, -15])
      camera.updateMatrixWorld(true)
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera)
        expect(Math.abs(projected.x)).toBeLessThan(1)
        expect(Math.abs(projected.y)).toBeLessThan(1)
        expect(Math.abs(projected.z)).toBeLessThan(1)
      }
    }
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  it('gives an empty asset a finite usable camera', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    expect(fitCameraToObject(new THREE.Group(), camera).toArray()).toEqual([0, 0, 0])
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true)
    expect(camera.position.length()).toBeCloseTo(3)
  })
})

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function instance() {
  return { root: new THREE.Group(), disposed: false, dispose() { this.disposed = true }, hasAnimation: false }
}

// No WebGL stand-in: these tests cancel before renderer construction.
const unusedCanvas = () => ({ getContext() { throw new Error('Test reached WebGL boundary') }, convertToBlob() {} })
const batchConfig = { width: 100, height: 100, batch: { gridSize: 2 } }

describe('view ownership before the WebGL boundary', () => {
  it('reports missing primary views for thumbnails and leaves the primary asset owned by its caller', async () => {
    const primary = instance()
    const views = createViews(primary, () => {}, () => {})
    await expect(views.captureThumbnail(256, 256)).rejects.toThrow(/primary view/i)
    views.detach('missing')
    views.dispose()
    views.dispose()
    views.detach('missing')
    expect(primary.disposed).toBe(false)
    await expect(views.attach('late', unusedCanvas(), batchConfig)).rejects.toThrow(/disposed/i)
  })

  it('reserves at most two view slots, including pending attachments', async () => {
    const pending = [deferred(), deferred()]
    let index = 0
    const views = createViews(instance(), () => pending[index++].promise, () => {})
    const attachments = ['one', 'two'].map(id => views.attach(id, unusedCanvas(), batchConfig))
    await expect(views.attach('three', unusedCanvas(), batchConfig)).rejects.toThrow(/two|2/)
    await expect(views.attach('one', unusedCanvas(), batchConfig)).rejects.toThrow(/already|duplicate/i)
    views.dispose()
    const copies = [instance(), instance()]
    pending.forEach((entry, i) => entry.resolve(copies[i]))
    await Promise.all(attachments)
    expect(copies.every(copy => copy.disposed)).toBe(true)
  })

  it('detaches built copies and disposes late copies without stealing the primary root', async () => {
    const primary = instance()
    const parent = new THREE.Group()
    parent.add(primary.root)
    const first = instance()
    const late = instance()
    const second = deferred()
    const seeds = []
    const views = createViews(primary, seed => {
      seeds.push(seed)
      return seeds.length === 1 ? Promise.resolve(first) : second.promise
    }, () => {}, { seed: 70 })
    const attaching = views.attach('batch', unusedCanvas(), batchConfig)
    await Promise.resolve()
    await Promise.resolve()
    expect(seeds).toEqual([70, 71])
    expect(first.root.parent).not.toBeNull()
    views.detach('batch')
    expect(first.disposed).toBe(true)
    expect(first.root.parent).toBeNull()
    second.resolve(late)
    await attaching
    expect(late.disposed).toBe(true)
    expect(late.root.parent).toBeNull()
    expect(primary.root.parent).toBe(parent)
    expect(primary.disposed).toBe(false)
    views.dispose()
  })

  it('reports a variant factory exception once and releases earlier copies', async () => {
    const copy = instance()
    const failures = []
    let calls = 0
    const views = createViews(instance(), async () => {
      if (++calls === 1) return copy
      throw new Error('variant failed')
    }, error => failures.push(error.message))
    await expect(views.attach('batch', unusedCanvas(), batchConfig)).rejects.toThrow('variant failed')
    expect(copy.disposed).toBe(true)
    expect(copy.root.parent).toBeNull()
    expect(failures).toEqual(['variant failed'])
    views.dispose()
  })

  it('disposes a malformed variant before reporting its invalid root', async () => {
    const badCopy = { disposed: false, dispose() { this.disposed = true } }
    const failures = []
    const views = createViews(instance(), async () => badCopy, error => failures.push(error.message))
    await expect(views.attach('batch', unusedCanvas(), batchConfig)).rejects.toThrow(/actual asset/i)
    expect(badCopy.disposed).toBe(true)
    expect(failures).toHaveLength(1)
    views.dispose()
  })

  it('does not let a variant steal or dispose the primary root', async () => {
    const primary = instance()
    const views = createViews(primary, async () => primary, () => {})
    await expect(views.attach('batch', unusedCanvas(), batchConfig)).rejects.toThrow(/distinct/i)
    expect(primary.root.parent).toBeNull()
    expect(primary.disposed).toBe(false)
    views.dispose()
  })

  it('keeps cleaning remaining copies if a generated disposer throws', async () => {
    const pending = deferred()
    const first = instance()
    first.dispose = () => { throw new Error('cleanup failed') }
    const second = instance()
    const failures = []
    let index = 0
    const views = createViews(instance(), () => {
      index++
      return index === 1 ? Promise.resolve(first) : index === 2 ? Promise.resolve(second) : pending.promise
    }, error => failures.push(error.message))
    const attaching = views.attach('batch', unusedCanvas(), batchConfig)
    await Promise.resolve()
    await Promise.resolve()
    views.dispose()
    expect(second.disposed).toBe(true)
    const late = instance()
    pending.resolve(late)
    await attaching
    expect(late.disposed).toBe(true)
    expect(failures).toEqual(['cleanup failed'])
  })
})
