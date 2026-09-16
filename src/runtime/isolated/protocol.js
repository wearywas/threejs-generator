import { z } from 'zod'
import { validateInstanceSpec } from '../../schemas/instanceSpec.js'

export const MAX_SOURCE = 500_000
export const MAX_BINARY = 64 * 1024 * 1024
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const vector = z.tuple([coordinate, coordinate, coordinate])
const count = z.number().int().min(0).max(100_000_000)
const renderCounts = z.object({ calls: count, triangles: count }).strict()
const optimizationSchema = z.object({
  enabled: z.boolean(), available: z.boolean(), before: renderCounts, after: renderCounts.nullable(),
  report: z.object({ sourceMeshes: count, resultMeshes: count, groups: count, instances: count,
    skippedMeshes: count, reason: z.string().max(2000).nullable() }).strict(),
}).strict().refine(value => (!value.enabled || value.available) && (value.available === (value.after !== null)), 'Inconsistent optimization result.')
const metadataSchema = z.object({
  isProcedural: z.boolean(), usesAddons: z.boolean(), hasAnimation: z.boolean(),
  usedAddons: z.array(z.enum(['Water', 'Water2', 'Sky', 'Reflector', 'SimplexNoise', 'textures'])).max(6),
  triangleCount: count,
  runtimeSignals: z.object({ bounds: z.object({ min: vector, max: vector, size: vector }).strict(), meshCount: count, instancedMeshCount: count, materialCount: count }).strict(),
  criticEvaluation: z.object({ accepted: z.boolean(), reasons: z.array(z.string().max(2000)).max(30), metrics: z.record(z.unknown()) }).optional(),
}).strict()

/** Only explicit data inputs are granted to generated factories. */
export function validateInput(code, options = {}) {
  if (typeof code !== 'string' || code.length > MAX_SOURCE || !/^\s*function\s+createAsset\s*\(/.test(code)) throw new Error('Expected createAsset code (maximum 500 KB).')
  const textures = options.textures || {}
  if (!textures || typeof textures !== 'object' || Array.isArray(textures) || Object.keys(textures).length > 32) throw new Error('Invalid texture inputs.')
  for (const value of Object.values(textures)) {
    if (typeof value !== 'string' || value.length > 7_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Textures must be supplied PNG, JPEG, or WebP data, not URLs.')
  }
  const input = { seed: options.seed ?? Math.floor(Math.random() * 0x100000000), params: options.params || {}, textures,
    maxTriangles: options.maxTriangles ?? 50000, prompt: options.prompt || '', assetFamily: options.assetFamily || 'general' }
  if (!Number.isSafeInteger(input.seed) || !(input.maxTriangles > 0) || typeof input.prompt !== 'string' || input.prompt.length > 20000 || typeof input.assetFamily !== 'string') throw new Error('Invalid execution options.')
  if (JSON.stringify(input).length > 32_000_000) throw new Error('Asset inputs exceed the 32 MB limit.')
  return structuredClone(input)
}

export function validateMetadata(value) {
  if (JSON.stringify(value).length > 32000) throw new Error('Runtime metadata exceeds the size limit.')
  return metadataSchema.parse(value)
}

export function validateGLB(value) {
  if (!(value instanceof ArrayBuffer) || value.byteLength < 20 || value.byteLength > MAX_BINARY) throw new Error('Invalid or oversized GLB export.')
  const header = new DataView(value)
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== value.byteLength) throw new Error('Invalid GLB header.')
  return value
}

export function validateThumbnail(value) {
  if (typeof value !== 'string' || value.length > 2_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid thumbnail response.')
  return value
}

export function validateAnalysis(value) {
  if (JSON.stringify(value).length > 8_000_000) throw new Error('Instance specification exceeds the size limit.')
  return validateInstanceSpec(value)
}

/** Only small, inert counts cross from the optimization worker to the UI. */
export function validateOptimization(value) {
  return optimizationSchema.parse(value)
}
