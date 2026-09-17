import { summarizeRetryReason } from './retryReason.js'

/** In-memory operation status; it neither schedules retries nor changes API billing. */
export function createGenerationProgressStore() {
  let snapshot = null
  let active = null
  let nextId = 0
  const listeners = new Set()
  const notify = () => listeners.forEach(listener => listener())

  function start(task, { signal, maxAttempts = 3 } = {}) {
    if (signal?.aborted) return { report() {}, finish() {} }
    active?.cleanup()

    const id = ++nextId
    const startedAt = Date.now()
    let closed = false
    let timer
    const cleanup = () => {
      closed = true
      clearInterval(timer)
      signal?.removeEventListener('abort', finish)
    }
    const finish = () => {
      if (closed || active?.id !== id) return
      cleanup()
      active = null
      snapshot = null
      notify()
    }
    const report = (stage, { attempt = snapshot?.attempt, repairAttempt = snapshot?.repairAttempt, retryReason } = {}) => {
      if (closed || active?.id !== id) return
      const reason = retryReason === undefined ? snapshot?.retryReason : summarizeRetryReason(retryReason)
      snapshot = { ...snapshot, stage, attempt, repairAttempt, retryReason: reason, elapsedMs: Math.max(0, Date.now() - startedAt) }
      notify()
    }

    active = { id, cleanup }
    snapshot = { id, task, stage: 'preparing', startedAt, elapsedMs: 0, attempt: 0, maxAttempts, repairAttempt: 0, retryReason: '' }
    signal?.addEventListener('abort', finish, { once: true })
    timer = setInterval(() => report(snapshot?.stage), 1000)
    notify()
    return { report, finish }
  }

  return {
    start,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
  }
}

export const generationProgress = createGenerationProgressStore()
