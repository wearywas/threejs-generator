import { expect, it } from 'vitest'
import { executeFactory } from './factory.js'

it('executes inside its caller realm without sharing saved input objects', async () => {
  const params = Object.freeze({ size: 2 })
  const asset = await executeFactory(`function createAsset(THREE, seed, textures, params) {
    params.size = 9;
    const root = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    root.userData.seed = seed;
    return {root};
  }`, { seed: 0, params })
  expect(asset.root.userData.seed).toBe(0)
  expect(asset.triangleCount).toBe(12)
  expect(params.size).toBe(2)
  asset.dispose()
})
