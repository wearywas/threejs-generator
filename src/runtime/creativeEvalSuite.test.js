import { describe, expect, it } from 'vitest'

import { getCreativeEvaluationSuite } from './creativeEvalSuite'

describe('getCreativeEvaluationSuite', () => {
  it('returns a stable environment and architecture prompt suite', () => {
    const suite = getCreativeEvaluationSuite()

    expect(suite.environment.groundCover.length).toBeGreaterThanOrEqual(5)
    expect(suite.environment.treeAndRock.length).toBeGreaterThanOrEqual(5)
    expect(suite.architecture.smallStructures.length).toBeGreaterThanOrEqual(5)
    expect(suite.stress.length).toBeGreaterThanOrEqual(3)
  })
})
