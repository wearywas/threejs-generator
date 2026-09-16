import { executeCode } from './CodeSandbox.js'
export { canConvertToInstanceSpec } from './batchingSupport.js'

/** Standalone analysis uses the same isolated boundary as previews. */
export async function generateInstanceSpec(code, options = {}) {
  const asset = await executeCode(code, { ...options, maxTriangles: Infinity })
  try { return await asset.analyze({ name: options.name, prompt: options.prompt }) }
  finally { asset.dispose() }
}
