import { describe, expect, it, vi } from 'vitest'
import { ownAsset } from '../runtime/assetWorkspace'
import { createIsolatedViewSession, getPreviewCamera } from './isolatedPreview'
import { PerspectiveCamera, Vector3 } from 'three'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

function runtime(overrides = {}) {
  let notify
  const asset = ownAsset({
    isIsolated: true,
    attachView: vi.fn(async () => {}),
    detachView: vi.fn(async () => {}),
    setCamera: vi.fn(async () => {}),
    resizeView: vi.fn(async () => {}),
    onError: listener => { notify = listener; return () => { notify = null } },
    dispose: vi.fn(),
    ...overrides,
  })
  return { asset, notify: error => notify?.(error) }
}

describe('isolated preview lifetime', () => {
  it('optimizes only a ready live session, never a closed replacement', async () => {
    const attaching = deferred()
    const selected = []
    const { asset } = runtime({ attachView: () => attaching.promise,
      setViewOptimization: async (id, enabled) => { selected.push([id, enabled]); return { enabled } } })
    const session = createIsolatedViewSession(asset, 'batch-optimized', {}, { batch: {} }, vi.fn())
    const operation = session.setOptimization(true)
    await flush()
    expect(selected).toEqual([])
    attaching.resolve()
    expect(await operation).toEqual({ enabled: true })
    expect(selected).toEqual([['batch-optimized', true]])
    await session.close()
    await expect(session.setOptimization(false)).rejects.toThrow(/not ready|closed/i)
    expect(selected).toHaveLength(1)
  })
  it('exports only the current attached view and refuses a replaced session', async () => {
    const attaching = deferred()
    const bytes = new ArrayBuffer(16)
    const exports = []
    const { asset } = runtime({
      attachView: () => attaching.promise,
      exportViewGLB: async id => { exports.push(id); return bytes },
    })
    const session = createIsolatedViewSession(asset, 'batch-current', {}, { batch: {} }, vi.fn())
    const download = session.exportGLB()
    await flush()
    expect(exports).toEqual([])
    attaching.resolve()
    expect(await download).toBe(bytes)
    expect(exports).toEqual(['batch-current'])
    await session.close()
    await expect(session.exportGLB()).rejects.toThrow(/not ready|closed/i)
    expect(exports).toEqual(['batch-current'])
  })
  it('stops a closed, still-attaching worker from overwriting the replacement frame', async () => {
    const attaching = deferred()
    const surface = { frame: null }
    let oldFrame
    // Controlled rendering endpoint, including attach's host-only presentation gate.
    const { asset } = runtime({ attachView: async (_, canvas, __, presentation) => {
      oldFrame = () => { if (!presentation || presentation.shouldPresent()) canvas.frame = 'old' }
      await attaching.promise
      oldFrame()
    } })
    const old = createIsolatedViewSession(asset, 'old', surface, {}, vi.fn())
    await flush()
    const closing = old.close()
    surface.frame = 'new'
    oldFrame()
    expect(surface.frame).toBe('new')
    attaching.resolve()
    await closing
    expect(surface.frame).toBe('new')
    expect(asset.detachView).toHaveBeenCalledTimes(1)
  })
  it('detaches a late attachment before releasing its lease', async () => {
    const attached = deferred()
    const detached = deferred()
    const disposed = vi.fn()
    const { asset } = runtime({ attachView: () => attached.promise, detachView: vi.fn(() => detached.promise), dispose: disposed })
    const canvas = {}
    const options = { width: 640, height: 480, pixelRatio: 2, batch: { gridSize: 3, spacing: 4 } }
    const session = createIsolatedViewSession(asset, 'batch-1', canvas, options, vi.fn())
    await flush()
    asset.dispose()
    const closed = session.close()
    await flush()
    expect(asset.detachView).not.toHaveBeenCalled()
    expect(disposed).not.toHaveBeenCalled()
    attached.resolve()
    await flush()
    expect(asset.detachView).toHaveBeenCalledWith('batch-1')
    expect(disposed).not.toHaveBeenCalled()
    detached.resolve()
    await closed
    await session.close()
    expect(disposed).toHaveBeenCalledTimes(1)
    expect(asset.detachView).toHaveBeenCalledTimes(1)
  })

  it('coalesces camera changes and resizes while requests are in flight', async () => {
    const cameraReply = deferred()
    const resizeReply = deferred()
    const { asset } = runtime({ setCamera: vi.fn(() => cameraReply.promise), resizeView: vi.fn(() => resizeReply.promise) })
    const canvas = {}
    const options = { width: 100, height: 100, pixelRatio: 1 }
    const session = createIsolatedViewSession(asset, 'primary-1', canvas, options, vi.fn())
    const first = { position: [1, 2, 3], target: [0, 0, 0] }
    session.setCamera(first)
    await session.ready
    await flush()
    expect(asset.attachView).toHaveBeenCalledWith('primary-1', canvas, options, { shouldPresent: expect.any(Function) })
    for (let i = 2; i < 100; i++) {
      session.setCamera({ position: [i, 2, 3], target: [0, 0, 0] })
      session.resize({ width: i, height: 100, pixelRatio: 1 })
    }
    await flush()
    expect(asset.setCamera).toHaveBeenCalledTimes(1)
    expect(asset.resizeView).toHaveBeenCalledTimes(1)
    cameraReply.resolve()
    resizeReply.resolve()
    await flush()
    expect(asset.setCamera).toHaveBeenLastCalledWith('primary-1', { position: [99, 2, 3], target: [0, 0, 0] })
    expect(asset.resizeView).toHaveBeenLastCalledWith('primary-1', { width: 99, height: 100, pixelRatio: 1 })
    expect(asset.setCamera).toHaveBeenCalledTimes(2)
    session.setCamera({ position: [99, 2, 3], target: [0, 0, 0] })
    await flush()
    expect(asset.setCamera).toHaveBeenCalledTimes(2)
    await session.close()
    session.setCamera(first)
    await flush()
    expect(asset.setCamera).toHaveBeenCalledTimes(2)
  })

  it('reports a runtime error once and stops sending controls updates', async () => {
    const report = vi.fn()
    const { asset, notify } = runtime()
    const session = createIsolatedViewSession(asset, 'primary-2', {}, {}, report)
    await session.ready
    notify(new Error('Worker stopped'))
    notify(new Error('Worker stopped again'))
    session.setCamera({ position: [1, 1, 1], target: [0, 0, 0] })
    await flush()
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][0].message).toBe('Worker stopped')
    expect(asset.setCamera).not.toHaveBeenCalled()
    await session.close()
    notify(new Error('Unmounted'))
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('catches attachment and cleanup failures without losing the lease', async () => {
    const report = vi.fn()
    const disposed = vi.fn()
    const { asset } = runtime({
      attachView: async () => { throw new Error('Canvas failed') },
      detachView: async () => { throw new Error('Runtime already gone') },
      dispose: disposed,
    })
    const session = createIsolatedViewSession(asset, 'primary-3', {}, {}, report)
    asset.dispose()
    await session.ready
    expect(report.mock.calls[0][0].message).toBe('Canvas failed')
    await session.close()
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('waits for the previous batch view to detach before attaching its replacement', async () => {
    const attached = deferred()
    const events = []
    const { asset } = runtime({
      attachView: async id => { events.push(`attach ${id}`); if (id === 'batch-old') await attached.promise },
      detachView: async id => { events.push(`detach ${id}`) },
    })
    const primary = createIsolatedViewSession(asset, 'primary', {}, {}, vi.fn())
    await primary.ready
    const first = createIsolatedViewSession(asset, 'batch-old', {}, { batch: {} }, vi.fn())
    await flush()
    first.close()
    const second = createIsolatedViewSession(asset, 'batch-new', {}, { batch: {} }, vi.fn())
    await flush()
    expect(events).toEqual(['attach primary', 'attach batch-old'])
    attached.resolve()
    await second.ready
    expect(events).toEqual(['attach primary', 'attach batch-old', 'detach batch-old', 'attach batch-new'])
    await Promise.all([primary.close(), second.close()])
  })

  it('skips views unmounted before attachment starts, as in StrictMode', async () => {
    const disposed = vi.fn()
    const { asset } = runtime({ dispose: disposed })
    const session = createIsolatedViewSession(asset, 'cancelled', {}, {}, vi.fn())
    asset.dispose()
    await session.close()
    expect(asset.attachView).not.toHaveBeenCalled()
    expect(asset.detachView).not.toHaveBeenCalled()
    expect(disposed).toHaveBeenCalledTimes(1)
  })
})

describe('metadata camera fit', () => {
  const bounds = { min: [-1, 0, -1], max: [1, 4, 1], size: [2, 4, 2] }
  it('targets the metadata center and widens the fit for a narrow viewport', () => {
    const fit = getPreviewCamera(bounds, 2)
    const narrow = getPreviewCamera(bounds, 0.5)
    expect(fit.target).toEqual([0, 2, 0])
    expect(narrow.distance).toBeGreaterThan(fit.distance)
    expect(fit.position.every(Number.isFinite)).toBe(true)
  })
  it('fits the full batch grid including scale and rotation jitter', () => {
    const single = getPreviewCamera(bounds, 1)
    const batch = getPreviewCamera(bounds, 1, { gridSize: 5, spacing: 10, rotationJitter: 1, scaleJitter: 0.5 })
    expect(batch.distance).toBeGreaterThan(single.distance)
    expect(batch.target).toEqual([0, 3, 0])
  })
  it('uses the viewport for a wide house batch without clipping its corners', () => {
    const house = { min: [-6.75, 0, -5], max: [6.75, 5.2, 5] }
    const fit = getPreviewCamera(house, 1.1, { gridSize: 3, spacing: 22.2, rotationJitter: 0.3, scaleJitter: 0.2 })
    const camera = new PerspectiveCamera(60, 1.1, 0.1, 1000)
    camera.position.fromArray(fit.position)
    camera.lookAt(new Vector3(...fit.target))
    camera.updateMatrixWorld()
    // 22.2m half-grid plus the 10.08m rotated/scaled footprint radius.
    const points = []
    for (const x of [-32.28, 32.28]) for (const y of [0, 6.24]) for (const z of [-32.28, 32.28]) {
      points.push(new Vector3(x, y, z).project(camera))
    }
    const occupancy = Math.max(...points.flatMap(point => [Math.abs(point.x), Math.abs(point.y)]))
    expect(occupancy).toBeGreaterThan(0.7)
    expect(occupancy).toBeLessThan(0.95)
  })
  it('gives empty bounds a finite camera position', () => {
    const fit = getPreviewCamera({ min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] }, 1)
    expect(fit.distance).toBeGreaterThanOrEqual(3)
    expect(fit.position.every(Number.isFinite)).toBe(true)
  })
})
