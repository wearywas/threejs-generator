import { ModelError } from '../modelErrors.js'

const fields = {
  convert: ['code', 'schemaJson'],
  edit: ['code', 'schemaJson', 'textureSlotsJson', 'changes'],
  animate: ['code', 'schemaJson', 'animationDescription'],
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const invalid = () => new ModelError('invalid_response', 'Codex did not return a valid completed final answer.', 502)

/** Keep dynamic parameter names inside JSON strings, not a fixed output schema. */
export function taskFormat(task) {
  const required = fields[task]
  if (!required) return null
  return {
    schema: { type: 'object', additionalProperties: false, required: [...required],
      properties: Object.fromEntries(required.map(key => [key, { type: 'string' }])) },
    instructions: '\n\nTransport format for this request overrides the output format above: return exactly an object with these string fields: '
      + required.join(', ') + '. The code field contains the complete JavaScript factory. '
      + 'schemaJson must contain the JSON serialization of the complete dynamic parameter schema object (all names, definitions and defaults). '
      + (task === 'edit' ? 'For an unchanged or absent schema, schemaJson may be the string "null". textureSlotsJson must serialize the texture slot array (id, label, optional description); use the string "null" to preserve existing slots, or "[]" to explicitly remove them. changes briefly describes the edit. ' : '')
      + (task === 'animate' ? 'Preserve existing controls and include animation controls in schemaJson. animationDescription briefly describes the animation. ' : '')
      + 'Do not return a schema object directly. The app parses the JSON strings back into the original response fields after completion.',
  }
}

export function supportsCodexTask(task) {
  return task === 'creative' || Object.hasOwn(fields, task)
}

/** Normalize data only; source is executed later by the isolated browser runtime. */
export function decodeTaskResult(task, text) {
  if (task === 'creative') return text
  try {
    const required = fields[task]
    const result = JSON.parse(text)
    if (!required || !object(result) || required.some(key => typeof result[key] !== 'string')
      || Object.keys(result).some(key => !required.includes(key)) || !result.code.trim()) throw invalid()
    const schema = JSON.parse(result.schemaJson)
    if (!object(schema) && !(task === 'edit' && schema === null)) throw invalid()
    const normalized = { code: result.code, schema }
    if (task === 'edit') {
      const slots = JSON.parse(result.textureSlotsJson)
      if (slots !== null && (!Array.isArray(slots) || slots.some(slot => !object(slot)
        || typeof slot.id !== 'string' || !slot.id.trim() || typeof slot.label !== 'string'
        || (slot.description !== undefined && typeof slot.description !== 'string')))) throw invalid()
      normalized.textureSlots = slots
      normalized.changes = result.changes
    }
    if (task === 'animate') normalized.animationDescription = result.animationDescription
    const output = JSON.stringify(normalized)
    if (output.length > 500000) throw invalid()
    return output
  } catch { throw invalid() }
}
