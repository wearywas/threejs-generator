import { describe, expect, it } from 'vitest'
import { getBatchPreviewSpacing } from './batchPreviewDefaults.js'

describe('getBatchPreviewSpacing', () => {
  it('leaves room for a house footprint with rotation and default scale jitter', () => {
    const asset = { runtimeSignals: { bounds: { min: [-6, 0, -4], max: [6, 5, 4], size: [12, 5, 8] } } }
    expect(getBatchPreviewSpacing(asset)).toBe(19.1)
  })

  it('allows for rotation about an off-center asset origin', () => {
    const asset = { runtimeSignals: { bounds: { min: [0, 0, 0], max: [12, 5, 8], size: [12, 5, 8] } } }
    expect(getBatchPreviewSpacing(asset)).toBe(38.1)
  })

  it('bases spacing on the ground footprint rather than height', () => {
    const asset = { runtimeSignals: { bounds: { min: [-1, 0, -1], max: [1, 100, 1], size: [2, 100, 2] } } }
    expect(getBatchPreviewSpacing(asset)).toBe(4)
  })

  it('respects the worker batch spacing ceiling for oversized assets', () => {
    const asset = { runtimeSignals: { bounds: { min: [-100, 0, -100], max: [100, 10, 100], size: [200, 10, 200] } } }
    expect(getBatchPreviewSpacing(asset)).toBe(100)
  })

  it.each([
    undefined,
    {},
    { runtimeSignals: {} },
    { runtimeSignals: { bounds: { min: [0, 0, 0], max: [NaN, 1, 2], size: [NaN, 1, 2] } } },
    { runtimeSignals: { bounds: { min: [0, 0, 0], max: [Infinity, 1, 2], size: [Infinity, 1, 2] } } },
    { runtimeSignals: { bounds: { min: [6, 0, 4], max: [-6, 5, -4], size: [-12, 5, -8] } } },
  ])('uses the existing fallback for absent or invalid bounds (%j)', asset => {
    expect(getBatchPreviewSpacing(asset)).toBe(4)
  })
})
