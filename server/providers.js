import { readAnthropicStream } from './anthropicStream.js'
import { ModelError, providerHttpError, transportError } from './modelErrors.js'
export { ModelError } from './modelErrors.js'

/** Call one selected provider. No SDK retries, model fallbacks, or arbitrary URLs. */
export async function requestModel({ provider, model, apiKey, system, messages, maxTokens, signal }, fetchImpl = fetch) {
  if (!['anthropic', 'openai'].includes(provider)) {
    throw new ModelError('invalid_provider', 'Choose Anthropic or OpenAI.', 400)
  }
  if (!apiKey) throw new ModelError('missing_key', 'Add an API key in Model settings or configure the local server environment.', 401)

  const isAnthropic = provider === 'anthropic'
  const url = isAnthropic ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/responses'
  const headers = isAnthropic
    ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
  const body = isAnthropic
    ? { model, max_tokens: maxTokens, system, messages, stream: true }
    : { model, store: false, instructions: system, input: messages, max_output_tokens: maxTokens }

  let response
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  } catch (error) {
    throw transportError(error, signal)
  }
  if (!response.ok) {
    // Do not echo the upstream error body, request headers, or prompt into logs/UI.
    try { await response.body?.cancel() } catch { /* Keep the known HTTP status. */ }
    throw providerHttpError(response.status)
  }

  let data
  try {
    data = isAnthropic ? await readAnthropicStream(response, signal) : await response.json()
    signal?.throwIfAborted()
  } catch (error) {
    throw transportError(error, signal, true)
  }
  const blocks = isAnthropic ? data.content : data.output?.filter(item => item.type === 'message').flatMap(item => item.content || [])
  if (data.stop_reason === 'refusal' || blocks?.some(block => block.type === 'refusal')) {
    throw new ModelError('refusal', 'The model declined this request. Try a different description or choose another model.')
  }
  if (data.stop_reason === 'max_tokens' || data.status === 'incomplete') {
    throw new ModelError('incomplete_output', 'The model ran out of output space. No partial code was executed. Try a simpler asset or another model.')
  }
  if (isAnthropic ? !['end_turn', 'stop_sequence'].includes(data.stop_reason) : data.status !== 'completed') {
    throw new ModelError('provider_error', 'The model did not complete a normal text response. No code was executed.')
  }
  const text = blocks?.filter(block => block.type === (isAnthropic ? 'text' : 'output_text')).map(block => block.text || '').join('')
  if (!text?.trim()) throw new ModelError('empty_output', 'The model returned no usable text. Try another model or description.')
  return { text, provider, requestedModel: model, model: data.model || model, usage: data.usage || {}, stopReason: isAnthropic ? data.stop_reason : data.status }
}
