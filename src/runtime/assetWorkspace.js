/** Own an asset until the workspace and all temporary consumers release it. */
export function ownAsset(asset) {
  let references = 1
  let ownerReleased = false
  const release = () => {
    if (--references === 0) {
      try { asset.dispose?.() } catch (error) { console.warn('Asset cleanup failed:', error) }
    }
  }
  return {
    ...asset,
    retain() {
      if (references === 0) throw new Error('Asset is already disposed')
      references++
      let released = false
      return () => { if (!released) { released = true; release() } }
    },
    dispose() {
      if (!ownerReleased) { ownerReleased = true; release() }
    },
  }
}

/** Atomic replacement; parameters serialize builds and coalesce queued patches. */
export function createAssetWorkspace() {
  let snapshot = { current: null, pending: null, parameterDraft: null, error: null }
  let serial = 0
  let active = true
  let pendingController = null
  let parameterSession = null
  const listeners = new Set()
  const publish = (next) => {
    snapshot = next
    listeners.forEach(listener => listener())
  }

  const dropParameters = () => {
    const session = parameterSession
    parameterSession = null
    session?.running?.resolve(false)
    session?.queued?.resolve(false)
  }

  async function run(kind, produce, expectedCurrent, session = null) {
    if (!active || (expectedCurrent !== undefined && (expectedCurrent !== snapshot.current || snapshot.pending))) return false
    if (!session) dropParameters()
    const id = ++serial
    pendingController?.abort()
    const controller = new AbortController()
    pendingController = controller
    const base = snapshot.current
    publish({ ...snapshot, pending: kind, parameterDraft: session ? snapshot.parameterDraft : null, error: null })
    const isCurrent = () => active && id === serial
    // Only patches queued AFTER this batch survive its failure. Successful
    // batches rebase those patches on the newly committed, normalized inputs.
    const settledParameters = current => ({
      pending: session?.queued ? 'parameters' : null,
      parameterDraft: session?.queued ? { ...current?.document.params, ...session.queued.patch } : null,
    })
    try {
      const candidate = await produce(base, isCurrent, controller.signal)
      if (!candidate?.asset) throw new Error('Operation did not return an asset')
      const sameSource = base && !['generate', 'load', 'import'].includes(kind) && base.document.code === candidate.document.code
      const owned = {
        document: candidate.document, asset: ownAsset(candidate.asset), revision: id,
        sourceRevision: sameSource ? base.sourceRevision : id,
      }
      if (!isCurrent()) { owned.asset.dispose(); return false }
      const previous = snapshot.current
      pendingController = null
      publish({ current: owned, ...settledParameters(owned), error: null })
      previous?.asset.dispose()
      return true
    } catch (error) {
      if (isCurrent()) publish({ ...snapshot, ...settledParameters(snapshot.current), error: error.name === 'AbortError' ? null : error.message })
      return false
    } finally {
      if (pendingController === controller) pendingController = null
    }
  }

  async function drainParameters(session) {
    while (parameterSession === session && session.queued) {
      const batch = session.queued
      session.queued = null
      session.running = batch
      const success = await run('parameters', (current, _, signal) => (
        batch.produce(current, { ...current?.document.params, ...batch.patch }, signal)
      ), undefined, session)
      batch.resolve(success)
      session.running = null
    }
    if (parameterSession === session) parameterSession = null
  }

  const workspace = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    activate() { active = true },
    cancel() {
      dropParameters()
      pendingController?.abort()
      pendingController = null
      serial++
      publish({ ...snapshot, pending: null, parameterDraft: null, error: null })
    },
    deactivate() {
      dropParameters()
      pendingController?.abort()
      pendingController = null
      active = false
      serial++
      const previous = snapshot.current
      publish({ current: null, pending: null, parameterDraft: null, error: null })
      previous?.asset.dispose()
    },
    run: (kind, produce, expectedCurrent) => run(kind, produce, expectedCurrent),
    /** One active build and one merged queued patch; coalesced callers share its result. */
    scheduleParameters(patch, produce) {
      if (!active || (snapshot.pending && snapshot.pending !== 'parameters')) return Promise.resolve(false)
      const start = !parameterSession
      if (start) parameterSession = { running: null, queued: null }
      const session = parameterSession
      if (!session.queued) {
        let resolve
        const promise = new Promise(done => { resolve = done })
        session.queued = { patch: {}, produce, promise, resolve }
      }
      const batch = session.queued
      batch.patch = { ...batch.patch, ...patch }
      publish({
        ...snapshot, pending: 'parameters', error: null,
        parameterDraft: { ...(snapshot.parameterDraft || snapshot.current?.document.params), ...patch },
      })
      if (start) drainParameters(session)
      return batch.promise
    },
  }
  return workspace
}
