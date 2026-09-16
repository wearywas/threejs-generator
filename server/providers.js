/** Safe, actionable errors; upstream bodies can contain sensitive request data. */
export class ModelError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'ModelError'
    this.code = code
    this.status = status
    this.retryable = false
  }
}

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
    ? { model, max_tokens: maxTokens, system, messages }
    : { model, store: false, instructions: system, input: messages, max_output_tokens: maxTokens }

  let response
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error
    throw new ModelError('connection_error', 'Could not reach the selected provider. Check your connection and try again.')
  }
  if (!response.ok) {
    // Do not echo the upstream error body, request headers, or prompt into logs/UI.
    await response.body?.cancel()
    if ([401, 403].includes(response.status)) throw new ModelError('authentication_error', 'The provider rejected this API key or account access. Check Model settings.', 401)
    if (response.status === 429) throw new ModelError('rate_limit', 'Provider rate limit or API quota reached. Check your API billing and retry later.', 429)
    if ([400, 404, 422].includes(response.status)) throw new ModelError('invalid_request', 'The provider rejected this model or request. Check the model ID and your account access.', 400)
    throw new ModelError('provider_error', 'The provider could not complete the request. Try again later.')
  }

  let data
  try {
    data = await response.json()
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error
    throw new ModelError('invalid_response', 'The provider returned an unreadable response.')
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
