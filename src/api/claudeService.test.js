import { describe, expect, it } from 'vitest'

import { generateMockSpec } from './claudeService'

describe('generateMockSpec', () => {
  it('uses broadleaf defaults for non-pine tree prompts', () => {
    const spec = generateMockSpec('a broadleaf oak tree with exposed roots')

    expect(spec.generator).toBe('proceduralTree')
    expect(spec.params.foliageType).toBe('broadleaf')
  })

  it('keeps pine prompts on a conifer silhouette', () => {
    const spec = generateMockSpec('a tall pine tree on a rocky hill')

    expect(spec.generator).toBe('proceduralTree')
    expect(spec.params.foliageType).toBe('cone')
  })
})
