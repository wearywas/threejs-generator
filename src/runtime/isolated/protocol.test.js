import { describe, expect, it } from 'vitest'
import { validateInput, validateMetadata, validateGLB, validateThumbnail, validateOptimization } from './protocol.js'

describe('isolated execution boundary', () => {
  it('accepts only bounded optimization measurements and inert report data', () => {
    const result = { enabled: true, available: true, before: { calls: 9, triangles: 108 }, after: { calls: 1, triangles: 108 },
      report: { sourceMeshes: 9, resultMeshes: 1, groups: 1, instances: 9, skippedMeshes: 0, reason: null } }
    expect(validateOptimization(result)).toEqual(result)
    expect(() => validateOptimization({ ...result, before: { calls: Infinity, triangles: 108 } })).toThrow()
    expect(() => validateOptimization({ ...result, enabled: 'true' })).toThrow()
    expect(() => validateOptimization({ ...result, root: {} })).toThrow()
    expect(() => validateOptimization({ ...result, available: false })).toThrow()
    expect(() => validateOptimization({ ...result, after: null })).toThrow()
    expect(validateOptimization({ ...result, enabled: false, available: false, after: null, report: { ...result.report, reason: 'No compatible repeats.' } }).enabled).toBe(false)
  })
  it('rejects excessive source and URL-based texture capabilities', () => {
    expect(() => validateInput('x'.repeat(600_000), {})).toThrow(/code/i)
    expect(() => validateInput('function createAsset() {}', { textures: { wall: 'https://example.com/tracker.png' } })).toThrow(/texture/i)
    expect(() => validateInput('function createAsset() {}', { textures: { wall: 'data:image/svg+xml;base64,PHN2Zz4=' } })).toThrow(/texture/i)
  })

  it('accepts only finite bounded metadata, with no executable members', () => {
    const metadata = { isProcedural: false, usesAddons: false, usedAddons: [], hasAnimation: false, triangleCount: 12,
      runtimeSignals: { bounds: { min: [-1, 0, -1], max: [1, 2, 1], size: [2, 2, 2] }, meshCount: 1, instancedMeshCount: 0, materialCount: 1 } }
    expect(validateMetadata(metadata).triangleCount).toBe(12)
    expect(() => validateMetadata({ ...metadata, triangleCount: Infinity })).toThrow()
    expect(() => validateMetadata({ ...metadata, root: {} })).toThrow()
    expect(() => validateMetadata({ ...metadata, usedAddons: ['<script>'] })).toThrow()
    expect(() => validateMetadata({ ...metadata, runtimeSignals: { ...metadata.runtimeSignals, bounds: { min: [0,0,0], max: [1e300,1e300,1e300], size: [1e300,1e300,1e300] } } })).toThrow()
  })

  it('checks GLB headers and bounded raster thumbnail data', () => {
    expect(() => validateGLB(new ArrayBuffer(20))).toThrow(/GLB/)
    const glb = new ArrayBuffer(20)
    const view = new DataView(glb)
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 20, true)
    expect(validateGLB(glb)).toBe(glb)
    expect(() => validateThumbnail('data:text/html;base64,AAAA')).toThrow(/thumbnail/i)
  })
})
