import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { createRecoveryStore } from './workspaceRecovery'
import { createAssetDocument } from './assetDocument'

const documentData = () => createAssetDocument({
  mode: 'procedural', code: 'function createAsset() {}', seed: 0, prompt: 'A tower',
  params: { floors: 7 }, schema: { floors: { type: 'number', default: 3 } },
  textures: { wall: 'data:image/png;base64,abc' }, textureSlots: [{ id: 'wall', label: 'Wall' }],
})
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('single local workspace recovery record', () => {
  it('round-trips working inputs and a separate unapplied draft, without unrelated settings', async () => {
    const store = createRecoveryStore()
    expect(await store.load()).toBeNull()
    const document = documentData()
    const result = await store.save({ document: { ...document, apiKey: 'not-a-credential' }, draftCode: 'unfinished draft', provider: 'ignored' }, null)
    expect(await store.load()).toEqual(result)
    expect(result.document).toEqual(document)
    expect(result.draftCode).toBe('unfinished draft')
    expect(JSON.stringify(result)).not.toContain('not-a-credential')
    expect(Object.keys(result).sort()).toEqual(['document', 'draftCode', 'id', 'updatedAt', 'version'])
    expect((await indexedDB.databases()).map(db => db.name)).toEqual(['threejs-generator-recovery'])
  })

  it('does not overwrite or discard another tab’s newer recovery', async () => {
    const store = createRecoveryStore()
    const first = await store.save({ document: documentData() }, null)
    const newer = await store.save({ document: documentData(), draftCode: 'newer' }, first.id)
    await expect(store.save({ document: documentData() }, first.id)).rejects.toMatchObject({ code: 'RECOVERY_CONFLICT' })
    await expect(store.clear(first.id)).rejects.toMatchObject({ code: 'RECOVERY_CONFLICT' })
    expect(await store.load()).toEqual(newer)
    await store.clear(newer.id)
    expect(await store.load()).toBeNull()
  })

  it('waits for transaction commit, preserving the previous draft after a write abort', async () => {
    const store = createRecoveryStore()
    const first = await store.save({ document: documentData() }, null)
    const original = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
      const request = original.apply(this, args)
      request.addEventListener('success', () => this.transaction.abort(), { once: true })
      return request
    })
    await expect(store.save({ document: documentData(), draftCode: 'lost' }, first.id)).rejects.toThrow()
    expect(await store.load()).toEqual(first)
  })

  it('reports unavailable browser storage rather than claiming a save', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(createRecoveryStore().load()).rejects.toThrow(/storage/i)
  })

  it('retains an unsupported record for explicit discard instead of overwriting it on load', async () => {
    const store = createRecoveryStore()
    const first = await store.save({ document: documentData() }, null)
    const db = await new Promise(resolve => {
      const request = indexedDB.open('threejs-generator-recovery', 1)
      request.onsuccess = () => resolve(request.result)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite')
      tx.oncomplete = resolve
      tx.onabort = () => reject(tx.error)
      tx.objectStore('drafts').put({ ...first, version: 99 }, 'workspace')
    })
    db.close()
    expect(await store.load()).toEqual({ id: first.id, error: expect.stringContaining('Unsupported recovery format') })
    await expect(store.save({ document: documentData() }, null)).rejects.toMatchObject({ code: 'RECOVERY_CONFLICT' })
    await store.clear(first.id)
    expect(await store.load()).toBeNull()
  })
})
