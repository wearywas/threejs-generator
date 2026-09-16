import { createAssetDocument } from './assetDocument'

const DATABASE = 'threejs-generator-recovery'
const STORE = 'drafts'
const KEY = 'workspace'
export const RECOVERY_CHANNEL = 'threejs-generator-recovery'

export function recoveryConflict() {
  const error = new Error('Another tab updated the recovery copy. Save this asset to Library or download it; the other tab’s recovery has not been overwritten.')
  error.code = 'RECOVERY_CONFLICT'
  return error
}

function notifyOtherTabs(id) {
  // Best-effort invalidation only; storage transactions remain authoritative.
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel(RECOVERY_CHANNEL)
    channel.postMessage({ id })
    channel.close()
  } catch { /* Restricted browsers still check on focus and at every write. */ }
}

function payload(input) {
  if (input.draftCode != null && typeof input.draftCode !== 'string') throw new Error('Invalid recovery code draft')
  return { document: createAssetDocument(input.document), draftCode: input.draftCode ?? null }
}

/** One local recovery copy, independent of Library and provider settings. */
export function createRecoveryStore({ database } = {}) {
  function open() {
    return new Promise((resolve, reject) => {
      const storage = database || globalThis.indexedDB
      if (!storage) return reject(new Error('Browser storage is unavailable. Recovery could not be saved.'))
      const request = storage.open(DATABASE, 1)
      let blocked = false
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        blocked = true
        reject(new Error('Recovery storage is blocked by another tab. Close that tab and retry.'))
      }
      request.onsuccess = () => blocked ? request.result.close() : resolve(request.result)
    })
  }

  async function transaction(mode, action) {
    const db = await open()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        let result = null
        let failure
        tx.oncomplete = () => resolve(result)
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Recovery storage transaction was aborted.'))
        const store = tx.objectStore(STORE)
        const request = store.get(KEY)
        request.onsuccess = () => {
          try { result = action(store, request.result || null) }
          catch (error) { failure = error; tx.abort() }
        }
      })
    } finally { db.close() }
  }

  function checkOwner(record, expectedId) {
    if ((record?.id ?? null) !== expectedId) {
      throw recoveryConflict()
    }
  }

  return {
    async load() {
      const record = await transaction('readonly', (_store, record) => record)
      if (!record) return null
      try {
        if (record.version !== 1 || typeof record.id !== 'string' || !Number.isFinite(record.updatedAt)) {
          throw new Error('Unsupported recovery format')
        }
        if (record.document?.documentVersion !== 1) throw new Error('Unsupported asset format')
        return { version: 1, id: record.id, updatedAt: record.updatedAt, ...payload(record) }
      } catch (error) {
        // Retain a handle so the user can explicitly discard an unreadable record.
        return { id: record.id ?? null, error: `This recovery copy cannot be restored: ${error.message}` }
      }
    },
    async save(input, expectedId) {
      // Snapshot before awaiting storage; never include unrelated app/key state.
      const record = { version: 1, id: crypto.randomUUID(), updatedAt: Date.now(), ...payload(input) }
      const saved = await transaction('readwrite', (store, previous) => {
        checkOwner(previous, expectedId)
        store.put(record, KEY)
        return record
      })
      notifyOtherTabs(saved.id)
      return saved
    },
    async clear(expectedId) {
      await transaction('readwrite', (store, previous) => {
        checkOwner(previous, expectedId)
        store.delete(KEY)
      })
      notifyOtherTabs(null)
    },
  }
}
