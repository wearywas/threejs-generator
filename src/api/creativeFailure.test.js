import { describe, expect, it } from 'vitest'

import {
  classifyCreativeFailure,
  planCreativeRetry,
  summarizeCreativeAttempts
} from './creativeFailure'

describe('classifyCreativeFailure', () => {
  it('classifies sandbox validation failures and extracts the blocked pattern', () => {
    const failure = classifyCreativeFailure(
      new Error('Code contains potentially dangerous pattern: /\\bwindow\\s*\\./')
    )

    expect(failure.category).toBe('sandbox_validation')
    expect(failure.retryMode).toBe('repair')
    expect(failure.diagnostics.offendingPattern).toContain('window')
  })

  it('classifies runtime execution failures as repairable', () => {
    const failure = classifyCreativeFailure(
      new Error('Execution failed: windAngle is not defined')
    )

    expect(failure.category).toBe('runtime_execution')
    expect(failure.retryMode).toBe('repair')
  })

  it('classifies contract and triangle-budget failures as repairable execution failures', () => {
    const shapeFailure = classifyCreativeFailure(
      new Error('Function must return an object')
    )
    const budgetFailure = classifyCreativeFailure(
      new Error('Triangle count (62000) exceeds maximum (50000)')
    )

    expect(shapeFailure.category).toBe('runtime_execution')
    expect(shapeFailure.retryMode).toBe('repair')
    expect(budgetFailure.category).toBe('runtime_execution')
    expect(budgetFailure.retryMode).toBe('repair')
  })

  it('classifies critic failures as regenerate-first', () => {
    const failure = classifyCreativeFailure(
      new Error('Creative critic rejected the asset: Architecture asset looks fragmented instead of reading as a few strong masses.')
    )

    expect(failure.category).toBe('critic_rejection')
    expect(failure.retryMode).toBe('regenerate')
  })
})

describe('planCreativeRetry', () => {
  it('repairs validation failures with the previous code', () => {
    const nextStep = planCreativeRetry({
      prompt: 'watchtower',
      lastCode: 'function createAsset() {}',
      failure: classifyCreativeFailure(
        new Error('Code contains potentially dangerous pattern: /\\bwindow\\s*\\./')
      ),
      maxAttempts: 3,
      attemptIndex: 1,
      repairsUsed: 0,
      criticRegenerationsUsed: 0
    })

    expect(nextStep.action).toBe('repair')
    expect(nextStep.promptKind).toBe('repair')
  })

  it('allows two critic-led regenerations before stopping', () => {
    const criticFailure = () => classifyCreativeFailure(
      new Error('Creative critic rejected the asset: Architecture asset uses too many materials.')
    )

    const firstRetry = planCreativeRetry({
      prompt: 'watchtower',
      lastCode: 'function createAsset() {}',
      failure: criticFailure(),
      maxAttempts: 3,
      attemptIndex: 1,
      repairsUsed: 0,
      criticRegenerationsUsed: 0
    })

    const secondRetry = planCreativeRetry({
      prompt: 'watchtower',
      lastCode: 'function createAsset() {}',
      failure: criticFailure(),
      maxAttempts: 3,
      attemptIndex: 2,
      repairsUsed: 0,
      criticRegenerationsUsed: 1
    })

    const thirdRetry = planCreativeRetry({
      prompt: 'watchtower',
      lastCode: 'function createAsset() {}',
      failure: criticFailure(),
      maxAttempts: 4,
      attemptIndex: 3,
      repairsUsed: 0,
      criticRegenerationsUsed: 2
    })

    expect(firstRetry.action).toBe('retry')
    expect(firstRetry.promptKind).toBe('critic_regenerate')
    expect(secondRetry.action).toBe('retry')
    expect(secondRetry.promptKind).toBe('critic_regenerate')
    expect(thirdRetry.action).toBe('stop')
  })
})

describe('summarizeCreativeAttempts', () => {
  it('summarizes attempt outcomes for frontend reporting', () => {
    const summary = summarizeCreativeAttempts([
      { number: 1, phase: 'repair', category: 'runtime_execution', durationMs: 1200, outcome: 'failed' },
      { number: 2, phase: 'regenerate', category: 'critic_rejection', durationMs: 1800, outcome: 'failed' },
      { number: 3, phase: 'repair', category: 'sandbox_validation', durationMs: 900, outcome: 'failed' }
    ])

    expect(summary.totalAttempts).toBe(3)
    expect(summary.categories.runtime_execution).toBe(1)
    expect(summary.categories.critic_rejection).toBe(1)
    expect(summary.message).toContain('runtime_execution')
    expect(summary.message).toContain('critic_rejection')
  })
})
