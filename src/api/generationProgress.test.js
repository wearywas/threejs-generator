import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGenerationProgressStore } from './generationProgress.js'
import { validateMetadata } from '../runtime/isolated/protocol.js'

let store
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(10000)
  store = createGenerationProgressStore()
})
afterEach(() => vi.useRealTimers())

describe('generation progress lifecycle', () => {
  it('keeps a readable retry reason through validation and timer ticks, then clears it for the next operation', () => {
    const operation = store.start('creative')
    operation.report('repair', { attempt: 2, repairAttempt: 1, retryReason: 'Execution failed: branch is not defined' })
    operation.report('validation')
    vi.advanceTimersByTime(1000)
    expect(store.getSnapshot().retryReason).toBe('The generated code uses a value that was never defined.')
    operation.report('repair', { retryReason: 'x'.repeat(800) })
    expect(store.getSnapshot().retryReason).toBe('The previous result could not be used.')
    operation.finish()
    const next = store.start('edit')
    expect(store.getSnapshot().retryReason).toBe('')
    operation.report('repair', { retryReason: 'stale failure' })
    expect(store.getSnapshot().retryReason).toBe('')
    next.finish()
  })

  it.each([false, true])('summarizes invalid model bounds even when worker diagnostics are truncated (%s)', truncated => {
    let failure
    try {
      validateMetadata({ isProcedural: false, usesAddons: false, usedAddons: [], hasAnimation: false, triangleCount: 12,
        runtimeSignals: { bounds: { min: [NaN, NaN, NaN], max: [NaN, NaN, NaN], size: [NaN, NaN, NaN] }, meshCount: NaN, instancedMeshCount: 0, materialCount: 1 } })
    } catch (error) { failure = error.message }
    expect(failure.length).toBeGreaterThan(2000)
    const operation = store.start('creative')
    operation.report('model', { attempt: 2, retryReason: truncated ? failure.slice(0, 2000) : failure })
    expect(store.getSnapshot().retryReason).toBe('The generated model has an invalid size or position, so it could not be displayed.')
    operation.report('execution')
    vi.advanceTimersByTime(1000)
    expect(store.getSnapshot().retryReason).not.toMatch(/runtimeSignals|invalid_type|NaN|nan|…/)
    operation.finish()
  })

  it.each([
    ['Failed to parse code: Unexpected token }', 'The generated code contains a syntax error and could not run.'],
    ['Execution failed: branch.clone is not a function', 'The generated code tried to use an unavailable operation.'],
    ['Execution failed: broken fixture', 'The generated code stopped with an error while building the model.'],
    ['Triangle count (60000) exceeds maximum (50000)', 'The generated model exceeds the current detail limit.'],
    ['Code must start with "function createAsset(THREE, seed, textures)"', 'The response did not contain a usable 3D model.'],
    ['Result must have a "root" property that is a THREE.Object3D', 'The response did not contain a usable 3D model.'],
    ['Invalid JSON response: Unexpected token', 'The response could not be read in the required format.'],
    ['Response missing "schema" field', 'The response is missing the information needed for editable controls.'],
    ['Code contains potentially dangerous pattern: /fetch\\s*\\(/', "The generated code did not pass the preview's safety checks."],
    ['Asset init timed out; the isolated worker was stopped.', 'The generated code took too long to build the model.'],
    ['No text content in response', 'The model returned no usable content.'],
    ['[{"code":"invalid_type","path":["params","height"],"message":"Expected number"}]', 'Some of the model settings are missing or invalid.'],
    ['[{"code":"invalid_type","path":["other"],"message":"Private diagnostics"}]', 'The generated result did not match the required format.'],
    ['[{"code":"invalid_type","path":', 'The previous result could not be used.'],
    ['Unknown error <script>private diagnostics</script>', 'The previous result could not be used.'],
  ])('explains %s without exposing raw diagnostics', (retryReason, expected) => {
    const operation = store.start('creative')
    operation.report('repair', { retryReason })
    expect(store.getSnapshot().retryReason).toBe(expected)
    operation.report('repair', { retryReason: '' })
    expect(store.getSnapshot().retryReason).toBe('')
    operation.finish()
  })

  it('tracks elapsed time across real stages and clears the timer on settle', () => {
    const operation = store.start('creative', { maxAttempts: 3 })
    expect(store.getSnapshot()).toMatchObject({ task: 'creative', stage: 'preparing', elapsedMs: 0, attempt: 0, repairAttempt: 0 })
    operation.report('model', { attempt: 1 })
    vi.advanceTimersByTime(2100)
    expect(store.getSnapshot()).toMatchObject({ stage: 'model', elapsedMs: 2000, attempt: 1, maxAttempts: 3 })
    operation.report('execution')
    expect(store.getSnapshot()).toMatchObject({ stage: 'execution', startedAt: 10000, elapsedMs: 2100 })
    operation.finish()
    expect(store.getSnapshot()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels immediately, removes its abort listener, and ignores late updates', () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const operation = store.start('edit', { signal: controller.signal })
    controller.abort()
    expect(store.getSnapshot()).toBeNull()
    operation.report('execution')
    operation.finish()
    expect(store.getSnapshot()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('prevents stale reporters, cancellation and finalizers from replacing a newer operation', () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const old = store.start('creative', { signal: controller.signal })
    const oldId = store.getSnapshot().id
    const current = store.start('convert')
    const snapshot = store.getSnapshot()
    expect(snapshot.id).not.toBe(oldId)
    old.report('repair', { attempt: 2, repairAttempt: 1 })
    old.finish()
    controller.abort()
    expect(store.getSnapshot()).toBe(snapshot)
    expect(vi.getTimerCount()).toBe(1)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    current.finish()
  })

  it('does not start an already cancelled operation or displace an active one', () => {
    const current = store.start('animate')
    const snapshot = store.getSnapshot()
    const controller = new AbortController()
    controller.abort()
    const cancelled = store.start('edit', { signal: controller.signal })
    cancelled.report('model')
    cancelled.finish()
    expect(store.getSnapshot()).toBe(snapshot)
    expect(vi.getTimerCount()).toBe(1)
    current.finish()
  })

  it('publishes stable snapshots, unsubscribes, and cleans up the signal after success', () => {
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const operation = store.start('spec', { signal: controller.signal })
    expect(store.getSnapshot()).toBe(store.getSnapshot())
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    operation.report('validation')
    operation.finish()
    expect(listener).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })
})
