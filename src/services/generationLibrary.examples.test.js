import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

let library

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  library = await import('./generationLibrary')
})

afterEach(() => { vi.unstubAllGlobals() })

function example(id, overrides = {}) {
  return {
    id, name: id, prompt: 'a stone tower', family: 'tower', mode: 'creative',
    createdAt: 1, starred: false, tags: ['stone', 'tower'], spec: null,
    code: 'function createAsset(THREE) { return { root: new THREE.Group() }; }',
    schema: null, textureSlots: null, thumbnail: null, ...overrides,
  }
}

async function seed(records) {
  await library.importLibrary({ version: 2, generations: records })
}

describe('few-shot retrieval from isolated IndexedDB', () => {
  it('returns no arbitrary fallback, even for starred unrelated assets', async () => {
    await seed([example('tower', { starred: true })])
    expect(await library.getRelevantExamples('a jellyfish', 'creative')).toEqual([])
  })

  it('considers both creative and procedural source, not curated records', async () => {
    await seed([
      example('creative'),
      example('procedural', { mode: 'procedural', createdAt: 2 }),
      example('curated', { mode: 'curated', spec: { generator: 'simpleBuilding' }, createdAt: 3 }),
    ])
    const result = await library.getRelevantExamples('stone tower', 'creative', { limit: 3, assetFamily: 'tower' })
    expect(result.map(item => item.id)).toEqual(['procedural', 'creative'])
  })

  it('finds prompt content when older entries have no tags', async () => {
    await seed([
      example('jellyfish', { family: 'general', prompt: 'a luminous jellyfish', tags: [] }),
      example('tower', { starred: true, createdAt: 2 }),
    ])
    expect((await library.getRelevantExamples('jellyfish', 'creative')).map(item => item.id)).toEqual(['jellyfish'])
  })

  it('ranks same-family content first, then bucket matches, with stars breaking only equal scores', async () => {
    await seed([
      example('same-family', { createdAt: 1 }),
      example('bucket', { prompt: 'stone cottage', family: 'smallBuilding', tags: ['stone'], starred: true, createdAt: 5 }),
      example('starred-tie', { prompt: 'tower', tags: [], starred: true, createdAt: 2 }),
      example('newer-tie', { prompt: 'tower', tags: [], createdAt: 10 }),
    ])
    expect((await library.getRelevantExamples('stone tower', 'creative', { limit: 4, assetFamily: 'tower' })).map(item => item.id))
      .toEqual(['same-family', 'starred-tie', 'newer-tie', 'bucket'])
  })

  it('does not multiply relevance from duplicate tags or elevate a weak starred match', async () => {
    await seed([
      example('weak', { family: 'general', prompt: 'blue cube', tags: Array(200).fill('blue'), starred: true, createdAt: 10 }),
      example('strong', { tags: [] }),
    ])
    expect((await library.getRelevantExamples('blue tower', 'creative', { limit: 2, assetFamily: 'tower' })).map(item => item.id))
      .toEqual(['strong', 'weak'])
  })

  it('skips oversized source before applying the count limit and never truncates a snippet', async () => {
    const large = 'function createAsset() {/*' + 'x'.repeat(12000) + '*/}'
    const small = example('small', { createdAt: 1 })
    await seed([example('large', { code: large, createdAt: 2 }), small])
    const result = await library.getRelevantExamples('stone tower', 'creative', 1)
    expect(result.map(item => item.id)).toEqual(['small'])
    expect(result[0].code).toBe(small.code)
  })

  it('fits whole sources within the total budget and continues past a non-fitting candidate', async () => {
    const source = length => 'function createAsset() {/*'.padEnd(length - 3, 'x') + '*/}'
    const records = [
      example('first', { code: source(10000), createdAt: 4 }),
      example('second', { code: source(10000), createdAt: 3 }),
      example('non-fitting', { code: source(5000), createdAt: 2 }),
      example('small', { code: source(4000), createdAt: 1 }),
    ]
    await seed(records)
    const result = await library.getRelevantExamples('stone tower', 'creative', { limit: 3 })
    expect(result.map(item => item.id)).toEqual(['first', 'second', 'small'])
    expect(result.reduce((sum, item) => sum + item.code.length, 0)).toBeLessThanOrEqual(24000)
    expect(result.map(item => item.code)).toEqual([records[0].code, records[1].code, records[3].code])
  })

  it('allows an empty result when all source is missing, blank, malformed, or too large', async () => {
    await seed([
      example('missing', { code: null }), example('blank', { code: '   ' }),
      example('non-text', { code: { source: 'not a string' } }),
      example('huge', { code: 'x'.repeat(24001) }),
    ])
    expect(await library.getRelevantExamples('stone tower', 'creative')).toEqual([])
  })

  it('does not execute source or migrate records during retrieval', async () => {
    await seed([example('legacy', { code: 'throw new Error("Must not execute")' })])
    const before = await library.getAllGenerations()
    expect((await library.getRelevantExamples('stone tower', 'creative')).map(item => item.id)).toEqual(['legacy'])
    expect(await library.getAllGenerations()).toEqual(before)
  })

  it('keeps zero-limit calls empty', async () => {
    await seed([example('tower')])
    expect(await library.getRelevantExamples('tower', 'creative', { limit: 0 })).toEqual([])
  })
})
