import { describe, expect, it } from 'vitest'

import { generatorSchemas, validateSpec } from './assetSpec'

describe('proceduralTree schema defaults', () => {
  it('defaults broadleaf trees to a connected canopy style', () => {
    const spec = validateSpec({
      generator: 'proceduralTree',
      params: {}
    })

    expect(spec.params.foliageType).toBe('broadleaf')
    expect(generatorSchemas.proceduralTree.params.foliageType.default).toBe('broadleaf')
    expect(generatorSchemas.proceduralTree.params.foliageType.options).toContain('broadleaf')
  })
})
