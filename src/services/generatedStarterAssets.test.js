import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatedStarters } from './generatedStarters'
import { createAssetDocument } from './assetDocument'
import { parseAssetSource, serializeAssetSource } from './assetSource'

describe('shipped generated starter assets', () => {
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
