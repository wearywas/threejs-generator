import { describe, expect, it } from 'vitest'
import { requestModel } from './providers.js'
import { streamed } from './testFixtures/anthropicStream.js'

const input = {
  provider: 'anthropic', model: 'claude-fable-5', apiKey: 'test-secret',
  system: 'Return code.', messages: [{ role: 'user', content: 'A rock' }], maxTokens: 32000
}
const anthropic = {
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-fable-5',
  content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'function ' }, { type: 'text', text: 'createAsset() {}' }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 }
}
const openai = {
  id: 'resp_test', object: 'response', status: 'completed', model: 'gpt-6-astra',
  output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: 'function createAsset() {}', annotations: [] }] }],
  error: null, incomplete_details: null, usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 }
}

describe('provider requests', () => {
  it('sends Anthropic credentials only in headers and joins visible text, not reasoning', async () => {
    const response = await requestModel(input, async (url, options) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages')
      expect(options.headers['x-api-key']).toBe('test-secret')
      expect(JSON.parse(options.body)).toEqual({ model: 'claude-fable-5', max_tokens: 32000, system: 'Return code.', messages: input.messages, stream: true })
      return streamed(anthropic)
    })
    expect(response).toEqual({ text: 'function createAsset() {}', provider: 'anthropic', requestedModel: 'claude-fable-5', model: 'claude-fable-5', usage: { input_tokens: 100, output_tokens: 20 }, stopReason: 'end_turn' })
    expect(JSON.stringify(response)).not.toContain('private')
  })

  it('uses OpenAI Responses with storage disabled and no unsupported sampling settings', async () => {
    const response = await requestModel({ ...input, provider: 'openai', model: 'gpt-6-astra' }, async (url, options) => {
      expect(url).toBe('https://api.openai.com/v1/responses')
      expect(options.headers.Authorization).toBe('Bearer test-secret')
      expect(JSON.parse(options.body)).toEqual({ model: 'gpt-6-astra', store: false, instructions: 'Return code.', input: input.messages, max_output_tokens: 32000 })
      return Response.json(openai)
    })
    expect(response.text).toBe('function createAsset() {}')
    expect(response.model).toBe('gpt-6-astra')
    expect(response.provider).toBe('openai')
    expect(response.usage.output_tokens).toBe(20)
  })

  it.each([
    ['anthropic', { ...anthropic, stop_reason: 'max_tokens' }, 'incomplete_output'],
    ['anthropic', { ...anthropic, stop_reason: 'refusal' }, 'refusal'],
    ['anthropic', { ...anthropic, content: [] }, 'empty_output'],
    ['openai', { ...openai, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, 'incomplete_output'],
    ['openai', { ...openai, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, 'refusal'],
    ['openai', { ...openai, status: 'failed', error: { message: 'secret-sensitive' } }, 'provider_error']
  ])('rejects unsafe-to-execute %s output (%s)', async (provider, fixture, code) => {
    await expect(requestModel({ ...input, provider }, async () => provider === 'anthropic' ? streamed(fixture) : Response.json(fixture))).rejects.toMatchObject({ code, retryable: false })
  })

  it.each([401, 403, 429, 500])('returns safe HTTP %i errors without provider response bodies', async (status) => {
    const error = await requestModel(input, async () => Response.json({ error: { message: 'test-secret' } }, { status })).catch(e => e)
    expect(error.retryable).toBe(false)
    expect(error.message).not.toContain('test-secret')
    expect(error.status).toBe(status === 401 || status === 403 ? 401 : status === 429 ? 429 : 502)
  })

  it('passes cancellation to the upstream request', async () => {
    const controller = new AbortController()
    const promise = requestModel({ ...input, signal: controller.signal }, async (_url, options) => {
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects unknown providers without making a request', async () => {
    await expect(requestModel({ ...input, provider: 'http://attacker.test' }, () => { throw new Error('must not fetch') })).rejects.toMatchObject({ code: 'invalid_provider' })
  })
})
