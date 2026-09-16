import { describe, expect, it } from 'vitest'

import { getAnthropicModelForTask } from './llmConfig'

describe('getAnthropicModelForTask', () => {
  it('uses server-only names ahead of legacy configuration', () => {
    const env = { ANTHROPIC_MODEL: 'new-global', ANTHROPIC_MODEL_CREATIVE: 'new-creative', VITE_ANTHROPIC_MODEL_CREATIVE: 'legacy' }
    expect(getAnthropicModelForTask('creative', env)).toBe('new-creative')
    expect(getAnthropicModelForTask('edit', env)).toBe('new-global')
  })
  it('defaults creative generation to Claude Fable 5.1', () => {
    expect(getAnthropicModelForTask('creative', {})).toBe('claude-fable-5-1')
  })

  it.each(['spec', 'convert', 'animate', 'edit', 'test'])('defaults %s to Claude Fable 5.1 unless overridden', task => {
    expect(getAnthropicModelForTask(task, {})).toBe('claude-fable-5-1')
  })

  it('prefers task-specific overrides before the global override', () => {
    const env = {
      VITE_ANTHROPIC_MODEL: 'claude-opus-4-6',
      VITE_ANTHROPIC_MODEL_CREATIVE: 'claude-sonnet-4-6'
    }

    expect(getAnthropicModelForTask('creative', env)).toBe('claude-sonnet-4-6')
    expect(getAnthropicModelForTask('spec', env)).toBe('claude-opus-4-6')
  })
})
