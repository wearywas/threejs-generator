import { createRecoveryStore, recoveryConflict } from './workspaceRecovery'

/** Serializes autosaves and keeps startup recovery behind an explicit choice. */
export function createRecoveryController(store = createRecoveryStore()) {
  let state = { ready: false, candidate: null, status: 'loading', error: null, conflict: false, savedAt: null }
  const listeners = new Set()
  let started
  let loaded = false
  let expectedId = null
  let desired = null
  let savedSignature = null
  let saving = null
  const signature = input => JSON.stringify(input)
  const publish = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const fail = error => publish({ status: 'error', error: error.message || 'Recovery storage failed.', conflict: error.code === 'RECOVERY_CONFLICT' })

  function drain() {
    if (saving || !loaded || state.candidate || !desired || state.status === 'error') return saving
    saving = Promise.resolve().then(async () => {
      while (desired && signature(desired) !== savedSignature) {
        const input = desired
        try {
          const record = await store.save(input, expectedId)
          expectedId = record.id
          savedSignature = signature(input)
          publish({ savedAt: record.updatedAt })
        } catch (error) { fail(error); return }
      }
      if (!state.conflict) publish({ status: 'saved', error: null, conflict: false })
    }).finally(() => {
      saving = null
      // A subscriber may enqueue an edit while the completion is published.
      if (desired && signature(desired) !== savedSignature && state.status !== 'error') return drain()
    })
    return saving
  }

  async function start() {
    if (started) return started
    started = (async () => {
      try {
        const candidate = await store.load()
        loaded = true
        expectedId = candidate?.id ?? null
        publish({ ready: true, candidate, status: 'idle', error: candidate?.error || null })
        if (!candidate && desired) { publish({ status: 'saving' }); await drain() }
      } catch (error) { publish({ ready: true }); fail(error) }
    })()
    return started
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    start,
    update(document, draftCode = null) {
      if (!document || state.candidate) return
      desired = { document, draftCode }
      if (!loaded || state.status === 'error') return
      if (signature(desired) === savedSignature && !saving) return
      publish({ status: 'saving' })
      drain()
    },
    acceptRestored() {
      if (!state.candidate?.document) return
      desired = { document: state.candidate.document, draftCode: state.candidate.draftCode }
      // Claim the restored snapshot atomically; a stale offer must not report saved.
      savedSignature = null
      publish({ candidate: null, status: 'saving', error: null, conflict: false })
      drain()
    },
    async discard() {
      if (!state.candidate) return
      publish({ status: 'discarding', error: null })
      try {
        await store.clear(state.candidate.id)
        expectedId = null
        desired = null
        savedSignature = null
        publish({ candidate: null, status: 'idle', error: null, savedAt: null })
      } catch (error) {
        // Dismiss our stale offer, but never delete another tab's replacement.
        if (error.code === 'RECOVERY_CONFLICT') publish({ candidate: null })
        fail(error)
      }
    },
    async checkForChanges(observedId) {
      if (!loaded || (!desired && !state.candidate) || observedId === expectedId) return
      const before = expectedId
      try {
        const record = await store.load()
        if (before === expectedId && (record?.id ?? null) !== expectedId) fail(recoveryConflict())
      } catch (error) { fail(error) }
    },
    async retry() {
      // A conflict needs a user decision, not an automatic takeover of another tab.
      if (state.conflict || state.candidate) return
      publish({ status: 'saving', error: null })
      if (!loaded) { started = null; await start() }
      else {
        // The last read may have failed after another tab changed storage.
        savedSignature = null
        await drain()
      }
    },
    async flush() { await started; await saving },
  }
}
