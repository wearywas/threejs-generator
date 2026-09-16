import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatedStarters } from './generatedStarters'
import { createAssetDocument } from './assetDocument'
import { parseAssetSource, serializeAssetSource } from './assetSource'
import { Box3, Matrix4 } from 'three'
import { executeIsolated } from '../test/isolatedRuntime.js'

describe('shipped generated starter assets', () => {
  it.each([1, 7, 10])('apartment cedar clears the entrance sign and sills with %i floors at every supported scale extreme', async floorCount => {
    const record = JSON.parse(readFileSync(new URL('../../public/starters/park-apartments.json', import.meta.url), 'utf8'))
    for (const scale of [0.25, 1, 3]) {
      const asset = await executeIsolated(record.code, { seed: record.seed, params: { ...record.params, floorCount, scale } })
      try {
        asset.root.updateMatrixWorld(true)
        const cedar = []
        const instance = new Matrix4(), world = new Matrix4()
        const height = (3 + (floorCount - 1) * 2.7) * scale
        asset.root.traverse(object => {
          if (!object.isInstancedMesh) return
          object.geometry.computeBoundingBox()
          for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, instance)
            world.multiplyMatrices(object.matrixWorld, instance)
            const bounds = new Box3().copy(object.geometry.boundingBox).applyMatrix4(world)
            if (Math.abs(bounds.max.y - bounds.min.y - height) < 0.0001 * scale
              && bounds.min.z > 3.48 * scale && bounds.min.x > scale && bounds.max.x < 2 * scale) cedar.push(bounds)
          }
        })
        // The 2.7m-wide entrance sign ends at x=1.35; the upper sills end
        // at x=1.225. Keep real lateral clearance, not just a depth offset.
        expect(cedar.length).toBeGreaterThan(0)
        for (const bounds of cedar) {
          expect(bounds.min.x / scale - 1.35, 'Clearance beside entrance sign').toBeGreaterThan(0.03)
          expect(bounds.max.x / scale, 'Keep clear of the right-hand entrance lamp').toBeLessThan(1.63)
        }
        expect(cedar).toHaveLength(4) // One backing panel and three full-height slats.
      } finally { asset.dispose() }
    }
  })

  it.each(generatedStarters)('$name ships a valid, self-contained editable preset and real PNG', starter => {
    const record = JSON.parse(readFileSync(new URL(`../../public${starter.path}`, import.meta.url), 'utf8'))
    expect(record.documentVersion).toBe(1)
    expect(record.mode).toBe('procedural')
    expect(Object.keys(record.schema).length).toBeGreaterThan(0)
    expect(createAssetDocument(record)).toEqual(record)
    expect(record.restorationNotes).toEqual([])
    expect(Object.values(record.textures).every(value => value.startsWith('data:image/'))).toBe(true)
    // This parses source as text; it never executes the generated factory.
    expect(parseAssetSource(serializeAssetSource(record))).toEqual(record)
    const png = readFileSync(new URL(`../../public${starter.thumbnail}`, import.meta.url))
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(512)
    expect(png.readUInt32BE(20)).toBe(384)
  })
})
