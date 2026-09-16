import { describe, expect, it } from 'vitest'
import { createRecoveryController } from './recoveryController'
import { createRecoveryStore } from './workspaceRecovery'
import { createAssetDocument } from './assetDocument'
import { IDBFactory } from 'fake-indexeddb'

const doc = seed => createAssetDocument({ mode: 'creative', seed, prompt: 'Box', code: 'function createAsset() {}' })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const store = () => createRecoveryStore({ database: new IDBFactory() })

describe('workspace recovery coordination', () => {
  it('offers an existing draft without executing it or saving it to Library', async () => {
    const storage = store()
    const record = await storage.save({ document: doc(0), draftCode: 'unfinished' }, null)
    const recovery = createRecoveryController(storage)
    await recovery.start()
    expect(recovery.getSnapshot()).toMatchObject({ ready: true, candidate: record })
    recovery.update(doc(1), null)
    await recovery.flush()
    expect(await storage.load()).toEqual(record)
    recovery.acceptRestored()
    recovery.update(record.document, record.draftCode)
    await recovery.flush()
    expect(recovery.getSnapshot()).toMatchObject({ candidate: null, status: 'saved' })
    expect(await storage.load()).toMatchObject({ document: record.document, draftCode: record.draftCode })
  })

  it('serializes writes and only marks the latest snapshot protected after commit', async () => {
    const storage = store()
    const gate = deferred()
    const save = storage.save
    let calls = 0
    const recovery = createRecoveryController({ ...storage, save: async (...args) => {
      if (++calls === 1) await gate.promise
      return save(...args)
    } })
    await recovery.start()
    recovery.update(doc(1), null)
    recovery.update(doc(2), 'first draft')
    recovery.update(doc(3), 'latest draft')
    expect(recovery.getSnapshot().status).toBe('saving')
    gate.resolve()
    await recovery.flush()
    expect((await storage.load())).toMatchObject({ document: { seed: 3 }, draftCode: 'latest draft' })
    expect(recovery.getSnapshot().status).toBe('saved')
    expect(calls).toBeLessThanOrEqual(2)
  })

  it('keeps the previous recovery on failed save and supports an explicit retry', async () => {
    const storage = store()
    let fail = true
    const recovery = createRecoveryController({ ...storage, save: (...args) => {
      if (fail) return Promise.reject(new Error('Storage quota exceeded'))
      return storage.save(...args)
    } })
    await recovery.start()
    recovery.update(doc(1), null)
    await recovery.flush()
    expect(recovery.getSnapshot()).toMatchObject({ status: 'error', error: 'Storage quota exceeded' })
    fail = false
    await recovery.retry()
    expect(recovery.getSnapshot().status).toBe('saved')
    expect((await storage.load()).document.seed).toBe(1)
  })

  it('requires explicit discard of an offered draft and keeps it if deletion fails', async () => {
    const storage = store()
    const record = await storage.save({ document: doc(0) }, null)
    let fail = true
    const recovery = createRecoveryController({ ...storage, clear: (...args) => {
      if (fail) return Promise.reject(new Error('Cannot delete draft'))
      return storage.clear(...args)
    } })
    await recovery.start()
    await recovery.discard()
    expect(recovery.getSnapshot().candidate).toEqual(record)
    fail = false
    await recovery.discard()
    expect(recovery.getSnapshot().candidate).toBeNull()
    expect(await storage.load()).toBeNull()
  })

  it('does not strand an edit arriving as the previous save finishes', async () => {
    const storage = store()
    const recovery = createRecoveryController(storage)
    await recovery.start()
    let changed = false
    const unsubscribe = recovery.subscribe(() => {
      if (!changed && recovery.getSnapshot().status === 'saved') {
        changed = true
        recovery.update(doc(2), 'edit at save completion')
      }
    })
    recovery.update(doc(1), null)
    await recovery.flush()
    unsubscribe()
    expect((await storage.load())).toMatchObject({ document: { seed: 2 }, draftCode: 'edit at save completion' })
    expect(recovery.getSnapshot().status).toBe('saved')
  })

  it('does not claim a stale restored copy is protected or overwrite another tab', async () => {
    const storage = store()
    const first = await storage.save({ document: doc(1) }, null)
    const recovery = createRecoveryController(storage)
    await recovery.start()
    const newer = await storage.save({ document: doc(2) }, first.id)
    recovery.acceptRestored()
    await recovery.flush()
    expect(recovery.getSnapshot()).toMatchObject({ candidate: null, status: 'error', conflict: true })
    expect(await storage.load()).toEqual(newer)
  })

  it('dismisses a stale offered copy on discard without deleting another tab’s replacement', async () => {
    const storage = store()
    const first = await storage.save({ document: doc(1) }, null)
    const recovery = createRecoveryController(storage)
    await recovery.start()
    const newer = await storage.save({ document: doc(2) }, first.id)
    await recovery.discard()
    expect(recovery.getSnapshot()).toMatchObject({ candidate: null, status: 'error', conflict: true })
    expect(await storage.load()).toEqual(newer)
  })

  it('withdraws saved status when another tab replaces the recovery copy', async () => {
    const storage = store()
    const recovery = createRecoveryController(storage)
    await recovery.start()
    recovery.update(doc(1), null)
    await recovery.flush()
    const first = await storage.load()
    await storage.save({ document: doc(2) }, first.id)
    await recovery.checkForChanges()
    expect(recovery.getSnapshot()).toMatchObject({ status: 'error', conflict: true })
  })

  it('retries through storage after a failed recheck instead of trusting an obsolete saved signature', async () => {
    const storage = store()
    let failRead = false
    const recovery = createRecoveryController({ ...storage, load: () => {
      if (failRead) return Promise.reject(new Error('Storage unavailable'))
      return storage.load()
    } })
    await recovery.start()
    recovery.update(doc(1), null)
    await recovery.flush()
    await storage.clear((await storage.load()).id)
    failRead = true
    await recovery.checkForChanges()
    expect(recovery.getSnapshot()).toMatchObject({ status: 'error', conflict: false })
    failRead = false
    await recovery.retry()
    expect(recovery.getSnapshot()).toMatchObject({ status: 'error', conflict: true })
    expect(await storage.load()).toBeNull()
  })
})
