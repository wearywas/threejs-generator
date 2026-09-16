import { describe, expect, it } from 'vitest'
import { createAssetDocument } from './assetDocument'
import { serializeAssetSource, parseAssetSource } from './assetSource'

const code = `function createAsset(THREE, seed, textures, params, addons) {
  const inputs = { seed, textures: { ...textures }, params: { ...params }, addons };
  params.width = 999;
  return inputs;
}`
const document = createAssetDocument({ mode: 'procedural', code, seed: 0,
  prompt: 'Configured house', params: { width: 1.11, scale: 1.29, visible: false },
  schema: { width: { type: 'number', default: 1 }, scale: { type: 'number', default: 1 }, visible: { type: 'boolean', default: true } },
  textures: { wall: 'data:image/png;base64,AA==' }, textureSlots: [{ id: 'wall', label: 'Wall' }],
})
const loadModule = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

describe('JavaScript asset downloads', () => {
  it('recreates saved inputs outside the app without mutating the preset', async () => {
    const module = await loadModule(serializeAssetSource(document))
    const first = module.createSavedAsset({})
    expect(first).toEqual({ seed: 0, params: { width: 1.11, scale: 1.29, visible: false }, textures: { wall: 'data:image/png;base64,AA==' }, addons: undefined })
    expect(module.createSavedAsset({}).params.width).toBe(1.11)
    expect(module.assetPreset.params.width).toBe(1.11)
  })

  it('allows explicit overrides and passes caller-supplied addons through', async () => {
    const module = await loadModule(serializeAssetSource(document))
    const addons = { helper: true }
    const result = module.createSavedAsset({}, { seed: 17, params: { width: 2, visible: true }, textures: { roof: 'roof image' } }, addons)
    expect(result).toEqual({ seed: 17, params: { width: 2, scale: 1.29, visible: true }, textures: { wall: 'data:image/png;base64,AA==', roof: 'roof image' }, addons })
  })

  it('round-trips the original source, controls, seed, and textures without executing source', () => {
    const doc = createAssetDocument({ ...document, code: 'function createAsset() { throw new Error("must not execute during import parsing") }' })
    const restored = parseAssetSource(serializeAssetSource(doc).replace(/\n/g, '\r\n'))
    expect(restored).toEqual(doc)
  })

  it('safely round-trips template delimiters and prototype-shaped JSON keys', async () => {
    const params = JSON.parse('{"__proto__":{"flag":true},"label":"` ${globalThis.assetSourceInjected = true} \\n </script>"}')
    const doc = createAssetDocument({ ...document, schema: null, params, prompt: 'function createAsset in a description' })
    const source = serializeAssetSource(doc)
    const module = await loadModule(source)
    expect(module.assetPreset.params).toEqual(params)
    expect(Object.hasOwn(module.assetPreset.params, '__proto__')).toBe(true)
    expect(globalThis.assetSourceInjected).toBeUndefined()
    expect(parseAssetSource(source)).toEqual(doc)
  })

  it('leaves raw or older source files to the existing importer', () => {
    expect(parseAssetSource(code)).toBeNull()
    expect(parseAssetSource('// ThreeJS Generator - Creative Mode Asset\n' + code)).toBeNull()
  })

  it('rejects damaged or unsupported presets instead of silently losing saved inputs', () => {
    const source = serializeAssetSource(document)
    expect(() => parseAssetSource(source.replace('"seed": 0', '"seed": "bad"'))).toThrow(/seed/i)
    expect(() => parseAssetSource(source.replace('"documentVersion": 1', '"documentVersion": 99'))).toThrow(/version/i)
    expect(() => parseAssetSource(source.replace('asset v1', 'asset v99'))).toThrow(/version/i)
    expect(() => parseAssetSource(source.replace('"seed": 0', '"seed": (() => 0)()'))).toThrow(/preset|JSON/i)
  })
})
