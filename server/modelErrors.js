/** Safe errors only: upstream messages, headers and prompts must not reach logs or UI. */
export class ModelError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'ModelError'
    this.code = code
    this.status = status
    this.retryable = false
  }
}

export function providerHttpError(status) {
  if ([401, 403].includes(status)) return new ModelError('authentication_error', 'The provider rejected this API key or account access. Check Model settings.', 401)
  if (status === 429) return new ModelError('rate_limit', 'Provider rate limit or API quota reached. Check your API billing and retry later.', 429)
  if ([400, 404, 422].includes(status)) return new ModelError('invalid_request', 'The provider rejected this model or request. Check the model ID and your account access.', 400)
  if ([408, 504].includes(status)) return new ModelError('provider_timeout', 'The provider took too long to respond. No code was executed. Try again or choose another model.', 504)
  return new ModelError('provider_error', 'The provider could not complete the request. Try again later.')
}

function isTimeout(error, depth = 0) {
  if (!error || depth > 5) return false
  return error.name === 'TimeoutError'
    || ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'].includes(error.code)
    || isTimeout(error.cause, depth + 1)
    || (Array.isArray(error.errors) && error.errors.some(cause => isTimeout(cause, depth + 1)))
}

/** Preserve explicit cancellation/deadlines, but never serialize raw network errors. */
export function transportError(error, signal, readingBody = false) {
  if (signal?.aborted) return signal.reason instanceof ModelError ? signal.reason : new DOMException('Aborted', 'AbortError')
  if (error instanceof ModelError || error.name === 'AbortError') return error
  if (isTimeout(error)) return providerHttpError(504)
  if (error instanceof SyntaxError || error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') return new ModelError('invalid_response', 'The provider returned an unreadable response.')
  return new ModelError('connection_error', readingBody
    ? 'The connection to the provider was interrupted. No partial code was used. Try again.'
    : 'Could not reach the selected provider. Check your connection and try again.')
}
