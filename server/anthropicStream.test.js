import { describe, expect, it, vi } from 'vitest'
import { requestModel } from './providers.js'
import { event, streamEvents } from './testFixtures/anthropicStream.js'

const input = { provider: 'anthropic', model: 'requested-model', apiKey: 'synthetic-secret', system: 'Source only', messages: [{ role: 'user', content: 'A tree' }], maxTokens: 32000 }
const message = { type: 'message', role: 'assistant', model: 'resolved-model', content: [{ type: 'text', text: 'const label = "café \u{1D11E}";' }], stop_reason: 'end_turn', usage: { input_tokens: 42, output_tokens: 9, cache_read_input_tokens: 5 } }
const headers = { 'Content-Type': 'text/event-stream; charset=utf-8' }
const response = events => new Response(events.map(event).join(''), { headers })
const run = events => requestModel(input, async () => response(events))

describe('buffered Anthropic streaming', () => {
  it.each(['\n', '\r\n', '\r'])('handles fragmented UTF-8 and %j framing while excluding thinking', async newline => {
    const events = streamEvents({ ...message, content: [{ type: 'thinking', thinking: 'private reasoning' }, ...message.content, { type: 'text', text: '\n// complete' }] })
    events.splice(3, 0, { type: 'ping' }, { type: 'future_event' })
    const bytes = new TextEncoder().encode(events.map(event).join('').replaceAll('\n', newline))
    let offset = 0
    const body = new ReadableStream({ pull(controller) { if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.slice(offset, ++offset)) } })
    const result = await requestModel(input, async () => new Response(body, { headers }))
    expect(result).toEqual({ text: `${message.content[0].text}\n// complete`, provider: 'anthropic', requestedModel: 'requested-model', model: 'resolved-model', usage: message.usage, stopReason: 'end_turn' })
    expect(JSON.stringify(result)).not.toContain('private')
  })

  it('waits for message_stop even after text and a stop reason, then cancels the reader', async () => {
    let controller
    const cancel = vi.fn()
    const body = new ReadableStream({ start(value) { controller = value }, cancel })
    let finished = false
    const result = requestModel(input, async () => new Response(body, { headers })).then(value => { finished = true; return value })
    controller.enqueue(new TextEncoder().encode(streamEvents(message).slice(0, -1).map(event).join('')))
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(finished).toBe(false)
    controller.enqueue(new TextEncoder().encode(event({ type: 'message_stop' })))
    expect((await result).text).toBe(message.content[0].text)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
  })

  it('accepts comments and multi-line data fields', async () => {
    const wire = streamEvents(message).map(event).join('').replace('data: {"type":"message_stop"}', ': keepalive\nretry: 5000\ndata: {"type":\ndata: "message_stop"}')
    expect((await requestModel(input, async () => new Response(wire, { headers }))).text).toBe(message.content[0].text)
  })

  it.each(['max_tokens', 'refusal'])('rejects a conflicting completion reason after %s', async stopReason => {
    const events = streamEvents({ ...message, stop_reason: stopReason })
    events.splice(-1, 0, { type: 'message_delta', delta: { stop_reason: 'end_turn' } })
    await expect(run(events)).rejects.toMatchObject({ code: 'invalid_response', retryable: false })
  })

  it('accepts repeated completion reasons and usage-only deltas', async () => {
    const events = streamEvents(message)
    events.splice(-1, 0,
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 10 } })
    expect(await run(events)).toMatchObject({ text: message.content[0].text, stopReason: 'end_turn', usage: { ...message.usage, output_tokens: 10 } })
  })

  it.each([1, 3, 5])('rejects EOF after %i events instead of returning partial code', async count => {
    await expect(run(streamEvents(message).slice(0, count))).rejects.toMatchObject({ code: 'stream_interrupted', retryable: false })
  })

  it.each([
    [{ type: 'message_stop' }],
    [streamEvents(message)[0], { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } }],
    [...streamEvents(message).slice(0, 3), ...streamEvents(message).slice(4)],
    [...streamEvents(message).slice(0, 4), { type: 'message_stop' }],
    [streamEvents(message)[0], streamEvents(message)[0]],
    [{ type: 'message_start', message: null }]
  ].map(events => ({ events })))('rejects invalid message ordering (%j)', async ({ events }) => {
    await expect(run(events)).rejects.toMatchObject({ code: 'invalid_response', retryable: false })
  })

  it('rejects malformed JSON without leaking response text', async () => {
    const error = await requestModel(input, async () => new Response('data: synthetic-secret\n\n', { headers })).catch(error => error)
    expect(error.code).toBe('invalid_response')
    expect(error.message).not.toContain('synthetic-secret')
  })

  it.each([
    ['overloaded_error', 'provider_error', 502],
    ['rate_limit_error', 'rate_limit', 429],
    ['authentication_error', 'authentication_error', 401],
    ['invalid_request_error', 'invalid_request', 400],
    ['timeout_error', 'provider_timeout', 504],
    ['api_error', 'provider_error', 502]
  ])('handles a mid-stream %s without returning partial code or upstream error text', async (type, code, status) => {
    const error = await run([...streamEvents(message).slice(0, 3), { type: 'error', error: { type, message: 'synthetic-secret' } }]).catch(error => error)
    expect(error).toMatchObject({ code, status, retryable: false })
    expect(JSON.stringify(error)).not.toContain('synthetic-secret')
    expect(error.message).not.toContain('synthetic-secret')
  })

  it('aborts an idle stream promptly and releases its reader', async () => {
    const abort = new AbortController(), cancel = vi.fn()
    const body = new ReadableStream({ cancel })
    const result = requestModel({ ...input, signal: abort.signal }, async () => new Response(body, { headers }))
    await Promise.resolve()
    abort.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
  })

  it('rejects a non-stream response instead of accepting an unexpected body', async () => {
    await expect(requestModel(input, async () => Response.json(message))).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('bounds an unfinished SSE event', async () => {
    await expect(requestModel(input, async () => new Response(`data: ${'x'.repeat(1024 * 1024 + 1)}`, { headers }))).rejects.toMatchObject({ code: 'response_too_large' })
  })

  it('bounds accumulated visible source across events', async () => {
    await expect(run(streamEvents({ ...message, content: [{ type: 'text', text: 'x'.repeat(250001) }, { type: 'text', text: 'y'.repeat(250000) }] }))).rejects.toMatchObject({ code: 'response_too_large' })
  })
})

describe('safe transport diagnostics', () => {
  it.each(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'])('classifies %s before headers and during streaming', async code => {
    const failure = new TypeError('synthetic-secret', { cause: Object.assign(new Error('synthetic-secret'), { code }) })
    for (const fetchImpl of [async () => { throw failure }, async () => new Response(new ReadableStream({ pull(controller) { controller.error(failure) } }), { headers })]) {
      const error = await requestModel(input, fetchImpl).catch(error => error)
      expect(error).toMatchObject({ code: 'provider_timeout', status: 504, retryable: false })
      expect(error.message).not.toContain('synthetic-secret')
    }
  })

  it('reports an interrupted socket as a connection error', async () => {
    const failure = new TypeError('private', { cause: Object.assign(new Error('private'), { code: 'UND_ERR_SOCKET' }) })
    await expect(requestModel(input, async () => new Response(new ReadableStream({ pull(controller) { controller.error(failure) } }), { headers }))).rejects.toMatchObject({ code: 'connection_error', retryable: false })
  })
})
