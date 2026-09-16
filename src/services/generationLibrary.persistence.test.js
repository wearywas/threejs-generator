import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb'

let library
let database

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  library = await import('./generationLibrary')
  await library.getAllGenerations()
  database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('threejs-generator-library', 2)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
})

afterEach(() => {
  database?.close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function documentData() {
  return {
    documentVersion: 1,
    prompt: 'a stone tower',
    mode: 'procedural',
    family: 'tower',
    seed: 0,
    params: { height: 7, material: { roughness: 0.4 } },
    textures: { wall: 'data:image/png;base64,d2FsbA==' },
    restorationNotes: ['Height restored from the saved parameters.'],
    spec: { type: 'tower', seed: 0, params: { height: 7 } },
    code: 'return buildTower(params, seed)',
    schema: { height: { type: 'number', default: 4 } },
    textureSlots: [{ id: 'wall', label: 'Wall texture' }]
  }
}

function writeRaw(records) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('generations', 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onabort = transaction.onerror = () => reject(transaction.error)
    const store = transaction.objectStore('generations')
    for (const record of records) store.add(record)
  })
}

function legacyRecord(id = 'legacy') {
  return {
    id,
    createdAt: 123,
    prompt: 'old stone tower',
    mode: 'creative',
    code: 'return oldTower()',
    tags: ['stone'],
    starred: true,
    historicalMetadata: { source: 'older backup' }
  }
}

function abortAfterWriteSuccess() {
  // Keep real requests and rollback behavior; inject an abort after request success.
  for (const method of ['add', 'put', 'delete', 'clear']) {
    const original = IDBObjectStore.prototype[method]
    vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (...args) {
      const request = original.apply(this, args)
      request.addEventListener('success', () => this.transaction.abort(), { once: true })
      return request
    })
  }
}

describe('generation library persistence', () => {
  it('round-trips the complete document through save, version-2 export, and import', async () => {
    const id = await library.saveGeneration({
      ...documentData(),
      name: 'My tower',
      thumbnail: 'data:image/png;base64,dGh1bWI=',
      customTags: ['favorite']
    })
    const saved = await library.getGeneration(id)
    expect(saved).toEqual({
      ...documentData(),
      id,
      createdAt: expect.any(Number),
      name: 'My tower',
      thumbnail: 'data:image/png;base64,dGh1bWI=',
      starred: false,
      tags: ['favorite', 'stone', 'tower']
    })

    const backup = JSON.parse(JSON.stringify(await library.exportLibrary()))
    expect(backup).toEqual({
      version: 2,
      exportedAt: expect.any(Number),
      count: 1,
      generations: [saved]
    })
    await library.clearLibrary()
    expect(await library.importLibrary(backup)).toEqual({ imported: 1, skipped: 0 })
    expect(await library.getGeneration(id)).toEqual({ ...saved, importedAt: expect.any(Number) })
  })

  it('captures a deep document snapshot before the caller can mutate the input', async () => {
    const input = documentData()
    const saving = library.saveGeneration(input)
    input.seed = 99
    input.params.material.roughness = 1
    input.textures.wall = 'different texture'
    input.restorationNotes.push('not part of the snapshot')
    input.spec.params.height = 100
    input.schema.height.default = 100
    input.textureSlots[0].label = 'Changed'

    expect(await library.getGeneration(await saving)).toMatchObject(documentData())
  })

  it('reads and exports raw legacy records without adding or rewriting document state', async () => {
    const original = legacyRecord()
    await writeRaw([original])
    expect(await library.getGeneration(original.id)).toEqual(original)
    expect(await library.getAllGenerations()).toEqual([original])
    expect((await library.exportLibrary()).generations).toEqual([original])
    expect(await library.getGeneration(original.id)).toEqual(original)
  })

  it('does not invent a seed when an older caller saves without document fields', async () => {
    const id = await library.saveGeneration({ prompt: 'a tower', mode: 'creative', code: 'old code' })
    const saved = await library.getGeneration(id)
    expect(saved).not.toHaveProperty('seed')
    expect(saved).not.toHaveProperty('documentVersion')
    expect(saved).toMatchObject({ name: 'a tower', family: 'tower', tags: ['tower'] })
  })

  it.each([undefined, 1, 2])('preserves legacy records imported from version %s', async version => {
    const original = legacyRecord()
    const backup = { generations: [original] }
    if (version !== undefined) backup.version = version
    expect(await library.importLibrary(backup)).toEqual({ imported: 1, skipped: 0 })
    expect(await library.getGeneration(original.id)).toEqual({ ...original, importedAt: expect.any(Number) })
  })

  it.each([3, 0, -1, 1.5, '2', null, true, {}])('rejects invalid backup version %j before writing', async version => {
    const original = legacyRecord('existing')
    await writeRaw([original])
    const outcome = await library.importLibrary({ version, generations: [legacyRecord('incoming')] })
      .then(value => ({ value }), error => ({ error }))
    expect(await library.getAllGenerations()).toEqual([original])
    expect(outcome.error).toBeInstanceOf(Error)
    expect(outcome.error.message).toMatch(/version|format/i)
  })

  it('skips existing and in-batch duplicate IDs without overwriting either first record', async () => {
    const original = legacyRecord('existing')
    const first = { ...legacyRecord('incoming'), prompt: 'first incoming tower' }
    await writeRaw([original])
    expect(await library.importLibrary({
      version: 2,
      generations: [
        { ...original, prompt: 'overwrite existing' },
        first,
        { ...first, prompt: 'overwrite first incoming' }
      ]
    })).toEqual({ imported: 1, skipped: 2 })
    expect(await library.getGeneration(original.id)).toEqual(original)
    expect(await library.getGeneration(first.id)).toEqual({ ...first, importedAt: expect.any(Number) })
    expect(await library.getAllGenerations()).toHaveLength(2)
  })

  it('assigns distinct IDs to existing and in-batch duplicates when skipping is disabled', async () => {
    const original = legacyRecord('existing')
    await writeRaw([original])
    expect(await library.importLibrary({
      version: 2,
      generations: [
        { ...original, prompt: 'copied existing' },
        { ...legacyRecord('incoming'), prompt: 'first incoming' },
        { ...legacyRecord('incoming'), prompt: 'second incoming' }
      ]
    }, { skipDuplicates: false })).toEqual({ imported: 3, skipped: 0 })
    const all = await library.getAllGenerations()
    expect(all).toHaveLength(4)
    expect(new Set(all.map(record => record.id)).size).toBe(4)
    expect(all.map(record => record.prompt).sort()).toEqual([
      'copied existing', 'first incoming', 'old stone tower', 'second incoming'
    ])
    expect(await library.getGeneration(original.id)).toEqual(original)
    expect((await library.getGeneration('incoming')).prompt).toBe('first incoming')
  })
})

describe('generation library transactions', () => {
  const mutations = [
    ['save', () => library.saveGeneration(documentData())],
    ['update', () => library.updateGeneration('existing', { name: 'Updated tower' })],
    ['delete', () => library.deleteGeneration('existing')],
    ['clear', () => library.clearLibrary()],
    ['import', () => library.importLibrary({ version: 2, generations: [legacyRecord('incoming')] })]
  ]

  it.each(mutations)('%s reports success only after the write transaction completes', async (_name, mutate) => {
    await writeRaw([legacyRecord('existing')])
    const events = []
    const original = IDBDatabase.prototype.transaction
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (...args) {
      const transaction = original.apply(this, args)
      if (transaction.mode === 'readwrite') {
        transaction.addEventListener('complete', () => events.push('complete'))
      }
      return transaction
    })

    await mutate()
    expect(events).toEqual(['complete'])
  })

  it.each(mutations)('%s rejects if its transaction aborts after request success', async (_name, mutate) => {
    const original = legacyRecord('existing')
    await writeRaw([original])
    abortAfterWriteSuccess()
    const outcome = await mutate().then(value => ({ value }), error => ({ error }))
    expect(await library.getAllGenerations()).toEqual([original])
    expect(outcome.error).toBeInstanceOf(Error)
  })

  it('rolls back the entire import when a write transaction aborts', async () => {
    const original = legacyRecord('existing')
    await writeRaw([original])
    abortAfterWriteSuccess()
    const outcome = await library.importLibrary({
      version: 2,
      generations: [legacyRecord('first'), legacyRecord('second')]
    }).then(value => ({ value }), error => ({ error }))
    expect(await library.getAllGenerations()).toEqual([original])
    expect(outcome.error).toBeInstanceOf(Error)
  })

  it('does not lose unrelated fields during concurrent updates', async () => {
    await writeRaw([legacyRecord('existing')])
    await Promise.all([
      library.updateGeneration('existing', { name: 'Renamed tower' }),
      library.updateGeneration('existing', { starred: false })
    ])
    expect(await library.getGeneration('existing')).toMatchObject({ name: 'Renamed tower', starred: false })
  })

  it('rejects a missing generation update without inserting a record', async () => {
    await expect(library.updateGeneration('missing', { starred: true })).rejects.toThrow(/not found/i)
    expect(await library.getAllGenerations()).toEqual([])
  })

  it('reports malformed import records as failure without committing earlier records', async () => {
    const outcome = await library.importLibrary({
      version: 2,
      generations: [legacyRecord('first'), { prompt: 'missing ID' }]
    }).then(value => ({ value }), error => ({ error }))
    expect(await library.getAllGenerations()).toEqual([])
    expect(outcome.error).toBeInstanceOf(Error)
  })

  it('retains the original quota error when queued import requests subsequently abort', async () => {
    const original = IDBObjectStore.prototype.add
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (record) {
      if (record.id === 'second') throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return original.call(this, record)
    })
    const outcome = await library.importLibrary({
      version: 2,
      generations: [legacyRecord('first'), legacyRecord('second')]
    }).then(value => ({ value }), error => ({ error }))
    expect(await library.getAllGenerations()).toEqual([])
    expect(outcome.error).toMatchObject({ name: 'QuotaExceededError' })
  })
})
