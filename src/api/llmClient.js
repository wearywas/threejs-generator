/** Browser transport: session tokens and public status only; no persistent key storage. */
export function createLlmClient(fetchImpl = (...args) => fetch(...args)) {
  let session = null
  let sessionRequest = null
  let snapshot = { pending: 0, lastResponse: null, requiresConfirmation: false }
  const listeners = new Set()
  const active = new Set()
  const notify = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()) }

  async function jsonRequest(url, options = {}) {
    try {
      const response = await fetchImpl(url, { credentials: 'same-origin', ...options })
      let data
      try { data = await response.json() }
      catch { throw new Error('The local API is unavailable. Start the app with npm run dev or npm start.') }
      if (!response.ok) {
        const error = new Error(data.error || 'The local service could not complete this request.')
        error.code = data.code
        if (data.code === 'session_expired') {
          session = null
          notify({ requiresConfirmation: true })
        }
        throw error
      }
      return data
    } catch (original) {
      const cancelled = original.name === 'AbortError' || options.signal?.aborted
      const error = new Error(cancelled ? 'Generation cancelled. The provider may still charge for work already performed.' : original.message)
      error.name = cancelled ? 'AbortError' : 'ModelRequestError'
      error.code = original.code || (cancelled ? 'cancelled' : 'connection_error')
      error.retryable = false
      throw error
    }
  }
  function getSession() {
    if (!sessionRequest) {
      sessionRequest = jsonRequest('/api/session').then(next => {
        if (typeof next.csrfToken !== 'string') {
          const error = new Error('The local API returned an invalid session. Restart the local server.')
          error.retryable = false
          throw error
        }
        session = next
        return session
      }).finally(() => { sessionRequest = null })
    }
    return sessionRequest
  }
  function waitForSession(signal) {
    const request = getSession()
    if (!signal) return request
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        signal.removeEventListener('abort', abort)
        callback(value)
      }
      const abort = () => {
        const error = new Error('Generation cancelled before the local session was ready.')
        error.name = 'AbortError'
        error.retryable = false
        finish(reject, error)
      }
      signal.addEventListener('abort', abort, { once: true })
      request.then(value => finish(resolve, value), error => finish(reject, error))
    })
  }
  async function post(url, value, signal) {
    const current = session || await waitForSession(signal)
    signal?.throwIfAborted()
    return jsonRequest(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': current.csrfToken }, body: JSON.stringify(value) })
  }
  async function createMessage(params) {
    if (snapshot.requiresConfirmation) {
      const error = new Error('Local session expired. Open Model settings, reconnect, then save your provider/model choice before generating again.')
      error.code = 'session_expired'
      error.retryable = false
      throw error
    }
    const controller = new AbortController()
    active.add(controller)
    notify({ pending: active.size })
    try {
      const result = await post('/api/message', params, controller.signal)
      controller.signal.throwIfAborted()
      if (typeof result.text !== 'string') {
        const error = new Error('The local API returned no generated text.')
        error.retryable = false
        throw error
      }
      const metadata = { provider: result.provider, model: result.model, requestedModel: result.requestedModel, usage: result.usage }
      notify({ lastResponse: metadata })
      return { ...metadata, content: [{ type: 'text', text: result.text }] }
    } catch (error) {
      error.retryable = false
      throw error
    } finally {
      active.delete(controller)
      notify({ pending: active.size })
    }
  }
  async function saveSettings(settings) {
    const next = await post('/api/settings', settings)
    session = next
    notify({ requiresConfirmation: false })
    return session
  }
  return {
    getSession, saveSettings, createMessage,
    cancelRequests: () => active.forEach(controller => controller.abort()),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot
  }
}

export const llmClient = createLlmClient()
export const createMessage = llmClient.createMessage
