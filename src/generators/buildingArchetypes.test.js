import { describe, expect, it } from 'vitest'

import { BUILDING_ARCHETYPES, createArchetypePlan } from './buildingArchetypes'

describe('createArchetypePlan', () => {
  it('defines the expected environment-focused building archetypes', () => {
    expect(Object.keys(BUILDING_ARCHETYPES)).toEqual(
      expect.arrayContaining([
        'cottage',
        'watchtower',
        'ruin',
        'timberHouse',
        'smallShop'
      ])
    )
  })

  it('turns watchtower requests into a tall conical tower plan', () => {
    const plan = createArchetypePlan({
      archetype: 'watchtower',
      footprint: { shape: 'rectangle', width: 10, depth: 8 },
      floors: 2,
      roofType: 'flat',
      styleKit: 'coastal_wood'
    })

    expect(plan.roofType).toBe('cone')
    expect(plan.floors).toBeGreaterThanOrEqual(4)
    expect(plan.styleKit).toBe('fantasy_stone')
    expect(plan.openingCadence).toBe('vertical-slit')
  })
})
