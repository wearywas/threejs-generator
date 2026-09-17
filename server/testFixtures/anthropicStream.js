export const event = value => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`

export function streamEvents(message) {
  return [
    { type: 'message_start', message: { ...message, content: [], stop_reason: null, usage: { ...message.usage, output_tokens: 1 } } },
    ...message.content.flatMap((block, index) => [
      { type: 'content_block_start', index, content_block: block.type === 'text' ? { type: 'text', text: '' } : block },
      ...(block.type === 'text' ? [{ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } }] : []),
      { type: 'content_block_stop', index }
    ]),
    { type: 'message_delta', delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: message.usage?.output_tokens ?? 0 } },
    { type: 'message_stop' }
  ]
}

export const streamed = message => new Response(streamEvents(message).map(event).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
