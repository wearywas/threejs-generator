import { it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { executeFactory as executeCode } from './isolated/factory.js'
import { createAsset } from './AssetFactory'

it('cleans a rejected triangle-budget result even without a generated disposer', async () => {
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
  const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose')
  try {
    await expect(executeCode(`function createAsset(THREE) {
      const root = new THREE.Group()
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
      return { root }
    }`, { maxTriangles: 1 })).rejects.toThrow(/Triangle count/)
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
  } finally { geometryDispose.mockRestore(); materialDispose.mockRestore() }
})

it('disposes shared mesh resources and textures once when no custom cleanup exists', async () => {
  const asset = await executeCode(`function createAsset(THREE) {
    const root = new THREE.Group()
    const geometry = new THREE.BoxGeometry()
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() })
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material))
    return { root }
  }`)
  const mesh = asset.root.children[0]
  const geometryDispose = vi.spyOn(mesh.geometry, 'dispose')
  const materialDispose = vi.spyOn(mesh.material, 'dispose')
  const textureDispose = vi.spyOn(mesh.material.map, 'dispose')
  asset.dispose()
  asset.dispose()
  expect(geometryDispose).toHaveBeenCalledTimes(1)
  expect(materialDispose).toHaveBeenCalledTimes(1)
  expect(textureDispose).toHaveBeenCalledTimes(1)
})

it('does not run curated cleanup twice or add a second generic disposal pass', () => {
  const asset = createAsset({ generator: 'rockCluster', seed: 0, params: { count: 1 } })
  let geometry
  asset.root.traverse(child => { if (child.geometry) geometry = child.geometry })
  const dispose = vi.spyOn(geometry, 'dispose')
  asset.dispose()
  asset.dispose()
  expect(dispose).toHaveBeenCalledTimes(1)
})
