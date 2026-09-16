import { describe, expect, it } from 'vitest'
import { canConvertToInstanceSpec } from './batchingSupport.js'

describe('canConvertToInstanceSpec', () => {
  it('does not promise random distribution from an InstancedMesh constructor alone', () => {
    const result = canConvertToInstanceSpec(`function createAsset(THREE) {
      const frontWindows = new THREE.InstancedMesh(geometry, material, 24)
      return { root: frontWindows }
    }`)

    expect(result.valid).toBe(true)
    expect(result.recommendation).toBe('high')
    expect(result.likelyStructure).toBe('hierarchical')
  })
})
