import { expect, it, vi } from 'vitest'
vi.mock('./isolated/client.js', () => import('../test/isolatedRuntime.js'))
import { generateBatchableExport } from './exporter'
import { createMinimalSpec } from '../schemas/instanceSpec.js'

it('exports an already analyzed specification without re-executing source', async () => {
  const spec = createMinimalSpec({ name: 'Snapshot' })
  const result = await generateBatchableExport('function createAsset(){ throw new Error("must not run again") }', { instanceSpec: spec })
  expect(result).toContain('Snapshot')
})

it('passes saved texture inputs through batch export to analysis', async () => {
  const code = `function createAsset(THREE, seed, textures, params) {
    if (!textures.wall) throw new Error('Missing wall texture')
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(params.size, 1, 1), new THREE.MeshStandardMaterial()))
    return { root }
  }`
  const exported = await generateBatchableExport(code, { seed: 0, params: { size: 3 }, textures: { wall: 'saved' } })
  expect(exported).toBeTruthy()
})
