import { describe, it, expect } from 'vitest'
import { createAssetDocument, restoreAssetDocument, resolveParams } from './assetDocument'

const code = 'function createAsset(THREE, seed, textures, params) { return { root: new THREE.Group() } }'

describe('asset documents', () => {
  it('snapshots complete execution inputs, including seed zero', () => {
    const input = { mode: 'procedural', code, seed: 0, schema: { size: { type: 'number', default: 1 } }, params: { size: 3 }, textures: { wall: 'data:image/png;base64,a' } }
    const doc = createAssetDocument(input)
    input.params.size = 9
    input.textures.wall = 'changed'
    expect(doc).toMatchObject({ documentVersion: 1, seed: 0, params: { size: 3 }, textures: { wall: 'data:image/png;base64,a' } })
    expect(restoreAssetDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
    expect(Object.isFrozen(doc.params)).toBe(true)
  })

  it('uses one validated curated spec for seed, defaults, and parameters', () => {
    const doc = createAssetDocument({ mode: 'curated', seed: 0, spec: { generator: 'rockCluster', seed: 999, params: {} } })
    expect(doc.spec.seed).toBe(0)
    expect(doc.params).toEqual(doc.spec.params)
    expect(Object.keys(doc.params).length).toBeGreaterThan(0)
  })

  it('restores legacy records non-destructively with stable, honest inferred values', () => {
    const old = { id: 'legacy-one', mode: 'procedural', code, schema: { size: { type: 'number', default: 2 } } }
    const restored = restoreAssetDocument(old)
    expect(restored.seed).toBe(restoreAssetDocument(old).seed)
    expect(restored.params).toEqual({ size: 2 })
    expect(restored.textures).toEqual({})
    expect(restored.restorationNotes.join(' ')).toMatch(/seed.*not saved/i)
    expect(old).not.toHaveProperty('seed')
    expect(restoreAssetDocument({ mode: 'curated', spec: { generator: 'rockCluster', seed: 17, params: {} } }).seed).toBe(17)
  })

  it('requires explicit new seeds and rejects unsupported document versions', () => {
    expect(() => createAssetDocument({ mode: 'creative', code })).toThrow(/seed/i)
    expect(() => restoreAssetDocument({ documentVersion: 99, mode: 'creative', code })).toThrow(/version/i)
    expect(() => restoreAssetDocument({ documentVersion: 1, mode: 'creative', code })).toThrow(/seed/i)
  })

  it.each([
    { schema: { size: null } },
    { schema: { color: { type: 'colors', default: 'not-an-array' } } },
    { schema: { mode: { type: 'select', options: {} } } },
    { textureSlots: {} },
    { textureSlots: [null] },
    { restorationNotes: [{}] },
  ])('rejects malformed control metadata before it can reach React: %j', malformed => {
    expect(() => createAssetDocument({ mode: 'creative', seed: 0, code, ...malformed })).toThrow(/schema|texture|restoration/i)
  })

  it('reconciles saved parameters with edited schemas without losing valid values', () => {
    const schema = {
      size: { type: 'number', min: 1, max: 5, default: 2 },
      choice: { type: 'select', options: ['a', 'b'], default: 'a' },
      enabled: { type: 'boolean', default: true },
      color: { type: 'color', default: '#ffffff' },
      fresh: { type: 'number', default: 4 },
    }
    expect(resolveParams(schema, { size: 9, choice: 'gone', enabled: false, color: '#123456', obsolete: 7 })).toEqual({ size: 5, choice: 'a', enabled: false, color: '#123456', fresh: 4 })
    expect(resolveParams(null, { raw: 3 })).toEqual({ raw: 3 })
  })
})
