import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatedStarters, loadGeneratedStarter } from './generatedStarters'

const document = {
  documentVersion: 1, mode: 'procedural', prompt: 'A park apartment building', family: 'building',
  spec: null, code: 'function createAsset() { throw new Error("Loading must not execute code") }',
  schema: { floors: { type: 'integer', min: 1, max: 8, default: 3 } },
  seed: 42, params: { floors: 4 }, textureSlots: [], textures: {}, restorationNotes: [],
}

afterEach(() => vi.unstubAllGlobals())

describe('generated starter loading', () => {
  it('keeps the gallery manifest lightweight and does not fetch when imported', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.resetModules()
    const { generatedStarters: manifest } = await import('./generatedStarters')
    expect(manifest.map(entry => entry.id)).toEqual(['park-apartments', 'woodland-mushrooms', 'alpine-cottage'])
    for (const entry of manifest) {
      expect(Object.keys(entry).sort()).toEqual(['description', 'id', 'name', 'path', 'thumbnail'])
      expect(entry.path).toBe(`/starters/${entry.id}.json`)
      expect(entry.thumbnail).toBe(`/starters/${entry.id}.png`)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches only the selected document and preserves its editable inputs without executing source', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(document)))
    vi.stubGlobal('fetch', fetch)
    const loaded = await loadGeneratedStarter('park-apartments')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/starters/park-apartments.json')
    expect(loaded).toEqual(document)
    expect(Object.isFrozen(loaded)).toBe(true)
    expect(Object.isFrozen(loaded.params)).toBe(true)
  })

  it('uses AssetDocument validation and normalization before returning a starter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...document, params: { floors: 20 } }))))
    expect((await loadGeneratedStarter(generatedStarters[0].id)).params).toEqual({ floors: 8 })
  })

  it.each([
    ['an HTTP error', () => Promise.resolve(new Response('', { status: 404 })), /404/],
    ['a network failure', () => Promise.reject(new Error('Network unavailable')), /Network unavailable/],
    ['invalid JSON', () => Promise.resolve(new Response('<html>Not JSON</html>')), /JSON/i],
    ['an invalid document', () => Promise.resolve(new Response(JSON.stringify({ ...document, seed: null }))), /seed/i],
    ['an invalid schema', () => Promise.resolve(new Response(JSON.stringify({ ...document, schema: { floors: { type: 'integer', default: 'bad' } } }))), /schema/i],
  ])('reports the starter name and cause for %s', async (_, response, cause) => {
    vi.stubGlobal('fetch', vi.fn(response))
    const result = loadGeneratedStarter('park-apartments')
    await expect(result).rejects.toThrow(/Could not load Park Apartments starter/)
    await expect(result).rejects.toThrow(cause)
  })

  it('rejects unknown starter IDs without requesting arbitrary paths', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(loadGeneratedStarter('../unknown')).rejects.toThrow(/Unknown generated starter/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
