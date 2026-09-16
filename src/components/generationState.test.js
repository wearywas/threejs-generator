import { describe, expect, it } from 'vitest'

import {
  buildFailedGenerationState,
  buildSuccessfulCreativeGenerationState
} from './generationState'

describe('buildFailedGenerationState', () => {
  it('clears stale creative results while preserving the prompt-facing error', () => {
    const state = buildFailedGenerationState({
      errorMessage: 'Failed to generate working code after 3 attempts',
      summaryMessage: 'failed after 3 attempts: runtime_execution x1, critic_rejection x1, sandbox_validation x1'
    })

    expect(state.asset).toBe(null)
    expect(state.generatedCode).toBe(null)
    expect(state.spec).toBe(null)
    expect(state.proceduralSchema).toBe(null)
    expect(state.proceduralParams).toEqual({})
    expect(state.creativeTextureSlots).toEqual([])
    expect(state.error).toContain('Failed to generate working code')
    expect(state.error).toContain('runtime_execution')
  })

  it('always routes fresh code generations back to creative mode', () => {
    const asset = { root: { id: 'mock-root' } }
    const state = buildSuccessfulCreativeGenerationState({
      code: 'function createAsset() {}',
      asset
    })

    expect(state.generatedCode).toBe('function createAsset() {}')
    expect(state.asset).toBe(asset)
    expect(state.spec).toBe(null)
    expect(state.generationMode).toBe('creative')
  })
})
