import { describe, expect, it } from 'vitest'

import {
  classifyAssetFamily,
  getAssetFamilyBucket,
  isStructuredCreativeFamily
} from './assetFamily'

describe('classifyAssetFamily', () => {
  it.each([
    ['a tree with a lantern', 'treePlant'],
    ['a decorated tree with lanterns', 'treePlant'],
    ['an adorned cottage with windows', 'smallBuilding'],
    ['a cottage with a door, windows and chimney', 'smallBuilding'],
    ['an arcade cabinet', 'general'],
    ['an arcade cabinet with a side panel depicting a tree', 'general'],
    ['an arcade cabinet featuring a tree illustration', 'general'],
    ['a lantern with tree carvings', 'buildingDetail'],
    ['a window with a cottage visible through it', 'buildingDetail'],
  ])('routes the primary subject of "%s" to %s', (prompt, family) => {
    expect(classifyAssetFamily(prompt)).toBe(family)
  })

  it('classifies environment prompts into targeted families', () => {
    expect(classifyAssetFamily('a patch of wild grass and flowers')).toBe('groundCover')
    expect(classifyAssetFamily('a windswept pine tree on a cliff')).toBe('treePlant')
    expect(classifyAssetFamily('a mossy rock cluster')).toBe('rockCluster')
  })

  it('classifies architecture prompts into targeted families', () => {
    expect(classifyAssetFamily('a cozy timber cottage')).toBe('smallBuilding')
    expect(classifyAssetFamily('a fantasy watchtower with banners')).toBe('tower')
    expect(classifyAssetFamily('arched stone doorway with lanterns')).toBe('buildingDetail')
    expect(classifyAssetFamily('a stone tower on a cliff')).toBe('tower')
    expect(classifyAssetFamily('a stone cottage with ivy')).toBe('smallBuilding')
  })

  it('does not match keywords inside longer words', () => {
    expect(classifyAssetFamily('An arcade cabinet')).toBe('general')
    expect(classifyAssetFamily('a dinner table with candles')).toBe('general')
    expect(classifyAssetFamily('a log cabin by the lake')).toBe('smallBuilding')
  })

  it('falls back to general for unrelated prompts', () => {
    expect(classifyAssetFamily('a floating neon jellyfish')).toBe('general')
    expect(getAssetFamilyBucket('tower')).toBe('architecture')
    expect(getAssetFamilyBucket('treePlant')).toBe('environment')
    expect(isStructuredCreativeFamily('general')).toBe(false)
    expect(isStructuredCreativeFamily('smallBuilding')).toBe(true)
  })
})
