import { createAssetDocument, restoreAssetDocument } from './assetDocument'

const HEADER = '// ThreeJS Generator asset v1'
const SOURCE_MARKER = '// @threejs-generator-source\n'

/** Downloadable ES module: original factory plus a replayable, data-only preset. */
export function serializeAssetSource(input, addonImports = '') {
  const { code, ...preset } = createAssetDocument(input)
  if (!code) throw new Error('JavaScript source downloads require a code-generated asset')
  // String.raw preserves JSON escapes. Escape template delimiters so metadata is
  // always data, even when a prompt/parameter contains backticks or interpolation.
  const json = JSON.stringify(preset, null, 2).replace(/[`$<>]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
  const imports = addonImports ? addonImports.split('\n').map(line => '// ' + line).join('\n') + '\n' : ''
  return `${HEADER}
// Last successfully applied source, seed, parameters, controls, and texture inputs.
// Only execute source you trust; this module is not an isolation boundary.
// Usage in your Three.js project:
//   import * as THREE from 'three';
//   import { createSavedAsset } from './asset.js'; // Use this file's name.
//   const asset = createSavedAsset(THREE);
//   scene.add(asset.root);
// Supply any required runtime addons as createSavedAsset(THREE, {}, addons).
// Built-in addon import hints (app-specific helpers are not bundled):
${imports}// For animation, call asset.update/asset.tick in your render loop; dispose when done.
// Texture data URLs are embedded; other texture URLs still need to be reachable.

export const assetPreset = JSON.parse(String.raw\`${json}\`);

export function createSavedAsset(THREE, overrides = {}, addons) {
  // Give each invocation fresh inputs, even if the generated factory mutates them.
  const inputs = JSON.parse(JSON.stringify({
    seed: overrides.seed ?? assetPreset.seed,
    params: { ...assetPreset.params, ...overrides.params },
    textures: { ...assetPreset.textures, ...overrides.textures }
  }));
  return createAsset(THREE, inputs.seed, inputs.textures, inputs.params, addons);
}

export { createAsset };

${SOURCE_MARKER}${code.trim()}
`
}

/** Read our saved inputs as JSON, never by evaluating an imported module. */
export function parseAssetSource(text) {
  if (typeof text !== 'string') return null
  const source = text.trim().replace(/\r\n/g, '\n')
  if (!source.startsWith('// ThreeJS Generator asset v')) return null
  if (source.split('\n')[0] !== HEADER) throw new Error('Unsupported JavaScript asset version')
  const match = source.match(/^export const assetPreset = JSON\.parse\(String\.raw`([^`]*?)`\);$/m)
  const start = match ? source.indexOf(SOURCE_MARKER, match.index + match[0].length) : -1
  if (!match || start === -1) throw new Error('Invalid JavaScript asset preset or source marker')
  let preset
  try { preset = JSON.parse(match[1]) } catch { throw new Error('Invalid JavaScript asset preset JSON') }
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) throw new Error('Invalid JavaScript asset preset')
  // Do not let damaged versioned exports fall back to legacy restoration defaults.
  if (preset.documentVersion === undefined) throw new Error('Missing asset document version')
  if (!['creative', 'procedural'].includes(preset.mode)) throw new Error('Invalid JavaScript asset mode')
  const code = source.slice(start + SOURCE_MARKER.length).trim()
  if (!code.startsWith('function createAsset')) throw new Error('Missing createAsset source')
  return restoreAssetDocument({ ...preset, code })
}
