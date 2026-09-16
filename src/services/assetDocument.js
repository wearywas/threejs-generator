import { validateSpec, inferAssetFamilyFromSpec } from '../schemas/assetSpec'
import { classifyAssetFamily } from './assetFamily'

export const ASSET_DOCUMENT_VERSION = 1
export const createSeed = () => Math.floor(Math.random() * 0x100000000)

const copy = (value) => JSON.parse(JSON.stringify(value))
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

function compatible(def, value) {
  if (value === undefined) return false
  if (def.type === 'number' || def.type === 'integer') return Number.isFinite(value)
  if (def.type === 'boolean') return typeof value === 'boolean'
  if (def.type === 'select') return def.options.includes(value)
  if (def.type === 'colors') return Array.isArray(value) && value.every(item => typeof item === 'string')
  if (def.type === 'color' || def.type === 'string') return typeof value === 'string'
  return true
}

function validateSchema(schema) {
  if (!isRecord(schema)) throw new Error('Parameter schema must be an object')
  for (const [key, def] of Object.entries(schema)) {
    const invalid = message => { throw new Error(`Invalid parameter schema for "${key}": ${message}`) }
    if (!isRecord(def) || typeof def.type !== 'string') invalid('expected a control definition with a type')
    for (const field of ['label', 'description']) {
      if (def[field] !== undefined && typeof def[field] !== 'string') invalid(`${field} must be text`)
    }
    if (def.type === 'select' && (!Array.isArray(def.options) || !def.options.every(value => typeof value === 'string'))) invalid('options must be an array of strings')
    for (const field of ['min', 'max']) {
      if (def[field] !== undefined && !Number.isFinite(def[field])) invalid(`${field} must be a finite number`)
    }
    if (def.min > def.max) invalid('minimum exceeds maximum')
    if (def.default !== undefined && !compatible(def, def.default)) invalid('default does not match the control type')
  }
}

function validateMetadata(input) {
  for (const field of ['prompt', 'family']) {
    if (input[field] !== undefined && typeof input[field] !== 'string') throw new Error(`${field} must be text`)
  }
  if (input.params != null && !isRecord(input.params)) throw new Error('Parameters must be an object')
  if (input.textures != null && (!isRecord(input.textures) || !Object.values(input.textures).every(value => typeof value === 'string'))) throw new Error('Texture inputs must be a map of strings')
  if (input.restorationNotes != null && (!Array.isArray(input.restorationNotes) || !input.restorationNotes.every(note => typeof note === 'string'))) throw new Error('Restoration notes must be an array of strings')
  if (input.textureSlots != null) {
    if (!Array.isArray(input.textureSlots)) throw new Error('Texture slots must be an array')
    const ids = new Set()
    for (const slot of input.textureSlots) {
      if (!isRecord(slot) || typeof slot.id !== 'string' || !slot.id || ids.has(slot.id)) throw new Error('Texture slots need unique nonempty IDs')
      ids.add(slot.id)
      for (const field of ['label', 'description', 'accept']) {
        if (slot[field] !== undefined && typeof slot[field] !== 'string') throw new Error(`Texture slot ${field} must be text`)
      }
    }
  }
}

/** Keep compatible values when a model adds or changes parameter controls. */
export function resolveParams(schema, values = {}) {
  if (!isRecord(values)) throw new Error('Parameters must be an object')
  if (!schema) return copy(values)
  validateSchema(schema)
  const params = {}
  for (const [key, definition] of Object.entries(schema)) {
    const def = definition
    let value = values[key]
    if (!compatible(def, value)) value = def.default
    if (Number.isFinite(value) && (def.type === 'number' || def.type === 'integer')) {
      if (Number.isFinite(def.min)) value = Math.max(def.min, value)
      if (Number.isFinite(def.max)) value = Math.min(def.max, value)
      if (def.type === 'integer') value = Math.round(value)
    }
    if (value !== undefined) params[key] = copy(value)
  }
  return params
}

/** Create a serializable, immutable snapshot of the inputs used for execution. */
export function createAssetDocument(input) {
  validateMetadata(input)
  if (!Number.isSafeInteger(input.seed)) throw new Error('An explicit integer seed is required')
  if (!['curated', 'creative', 'procedural'].includes(input.mode)) throw new Error('Invalid asset mode')
  const textures = copy(input.textures || {})
  let spec = null
  if (input.mode === 'curated') {
    if (!input.spec) throw new Error('Curated assets require a spec')
    const { textures: ignored, ...sourceSpec } = input.spec
    spec = validateSpec({ ...sourceSpec, seed: input.seed, params: input.params ?? sourceSpec.params })
  } else if (typeof input.code !== 'string' || !input.code.trim()) {
    throw new Error('Creative assets require source code')
  }
  return freeze(copy({
    documentVersion: ASSET_DOCUMENT_VERSION,
    mode: input.mode,
    prompt: input.prompt || '',
    family: input.family || (spec ? inferAssetFamilyFromSpec(spec) : classifyAssetFamily(input.prompt || '')),
    spec,
    code: spec ? null : input.code,
    schema: spec ? null : input.schema || null,
    seed: input.seed,
    params: spec ? spec.params : resolveParams(input.schema, input.params),
    textureSlots: spec ? [] : input.textureSlots || [],
    textures,
    restorationNotes: input.restorationNotes || [],
  }))
}

function legacySeed(record) {
  const key = String(record.id || `${record.code || JSON.stringify(record.spec)}:${record.prompt || ''}`)
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619)
  return hash >>> 0
}

/** Restore old library entries without claiming their missing inputs were recovered. */
export function restoreAssetDocument(record) {
  if (record.documentVersion !== undefined) {
    if (record.documentVersion !== ASSET_DOCUMENT_VERSION) throw new Error('Unsupported asset document version')
    return createAssetDocument(record)
  }
  const notes = [...(record.restorationNotes || [])]
  let seed = record.seed ?? record.spec?.seed
  if (!Number.isSafeInteger(seed)) {
    seed = legacySeed(record)
    notes.push('Original seed was not saved. A stable replacement seed is being used.')
  }
  if (!record.params && record.mode !== 'curated' && record.schema) {
    notes.push('Parameter values were not saved. Schema defaults are being used.')
  }
  if (!record.textures && !record.spec?.textures) {
    notes.push('Texture inputs were not saved. No global textures have been substituted.')
  }
  return createAssetDocument({ ...record, seed, textures: record.textures || record.spec?.textures || {}, restorationNotes: notes })
}
