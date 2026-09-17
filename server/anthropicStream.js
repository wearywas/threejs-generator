import { ModelError, providerHttpError } from './modelErrors.js'

const MAX_EVENT_CHARS = 1024 * 1024
const MAX_TEXT_CHARS = 500000 // Matches the generated runtime's source limit.
const invalid = () => new ModelError('invalid_response', 'The provider returned an invalid event stream. No partial code was used.')
const tooLarge = () => new ModelError('response_too_large', 'The provider response exceeded the supported size. No partial code was used.')

/** Parse SSE incrementally, including CRLF/UTF-8 split across network chunks. */
async function* events(body, signal) {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = '', data = [], size = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    while (true) {
      const { value, done } = await reader.read()
      signal?.throwIfAborted()
      pending += decoder.decode(value, { stream: !done })
      while (true) {
        const end = pending.search(/[\r\n]/)
        if (end < 0 || (!done && pending[end] === '\r' && end === pending.length - 1)) break
        const line = pending.slice(0, end)
        pending = pending.slice(end + (pending[end] === '\r' && pending[end + 1] === '\n' ? 2 : 1))
        if (line.length + size > MAX_EVENT_CHARS) throw tooLarge()
        if (!line) {
          if (data.length) {
            let event
            try { event = JSON.parse(data.join('\n')) } catch { throw invalid() }
            if (!event || typeof event.type !== 'string') throw invalid()
            data = []; size = 0
            yield event
          }
        } else if (line === 'data' || line.startsWith('data:')) {
          const text = line.slice(5).replace(/^ /, '')
          data.push(text); size += text.length + 1
        }
      }
      if (pending.length + size > MAX_EVENT_CHARS) throw tooLarge()
      if (done) return // An unterminated event cannot establish message completion.
    }
  } finally {
    signal?.removeEventListener('abort', abort)
    try { await reader.cancel() } catch { /* Keep the original safe failure. */ }
    reader.releaseLock()
  }
}

/** Buffer visible content only; a terminal message_stop is required before release. */
export async function readAnthropicStream(response, signal) {
  if (!/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get('content-type') || '') || !response.body) {
    try { await response.body?.cancel() } catch { /* Preserve the response-shape error. */ }
    throw invalid()
  }
  let started = false, active = null, stopReason = null, model, usage = {}, textSize = 0
  const content = []
  function append(block, text) {
    if (typeof text !== 'string') throw invalid()
    textSize += text.length
    if (textSize > MAX_TEXT_CHARS) throw tooLarge()
    block.text += text
  }
  for await (const event of events(response.body, signal)) {
    switch (event.type) {
      case 'error': {
        const statuses = { authentication_error: 401, permission_error: 403, rate_limit_error: 429, invalid_request_error: 400, not_found_error: 404, timeout_error: 504 }
        throw providerHttpError(Object.hasOwn(statuses, event.error?.type) ? statuses[event.error.type] : 502)
      }
      case 'message_start': {
        const message = event.message
        if (started || !message || message.type !== 'message' || message.role !== 'assistant' || typeof message.model !== 'string' || !Array.isArray(message.content) || message.content.length) throw invalid()
        started = true; model = message.model; usage = { ...message.usage }
        break
      }
      case 'content_block_start': {
        const block = event.content_block
        if (!started || active !== null || stopReason !== null || event.index !== content.length || content.length >= 1024 || !block || typeof block.type !== 'string') throw invalid()
        active = event.index
        const saved = block.type === 'text' ? { type: 'text', text: '' } : { type: block.type }
        content.push(saved)
        if (block.type === 'text') append(saved, block.text)
        break
      }
      case 'content_block_delta':
        if (active === null || event.index !== active || !event.delta || typeof event.delta.type !== 'string') throw invalid()
        if (event.delta.type === 'text_delta') {
          if (content[active].type !== 'text') throw invalid()
          append(content[active], event.delta.text)
        }
        break
      case 'content_block_stop':
        if (active === null || event.index !== active) throw invalid()
        active = null
        break
      case 'message_delta':
        if (!started || active !== null || !event.delta) throw invalid()
        if (event.delta.stop_reason != null) {
          if (typeof event.delta.stop_reason !== 'string' || (stopReason !== null && stopReason !== event.delta.stop_reason)) throw invalid()
          stopReason = event.delta.stop_reason
        }
        usage = { ...usage, ...event.usage }
        break
      case 'message_stop':
        if (!started || active !== null || !stopReason) throw invalid()
        return { model, usage, stop_reason: stopReason, content }
      // Pings and future event types do not change completion or visible content.
      default: break
    }
  }
  throw new ModelError('stream_interrupted', 'The provider response ended before it was complete. No partial code was used. Try again.')
}
