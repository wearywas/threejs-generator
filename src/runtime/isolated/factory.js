import * as THREE from 'three'
import { ADDONS } from '../addons.js'
import { createAssetDisposer } from '../assetDisposal.js'

/** Worker-only factory evaluation. Never import this module into the application runtime. */
const MAX_TRIANGLES = 50000

/**
 * Validate code before execution
 */
function validateCode(code) {
  // Early diagnostics only. The opaque Worker/CSP, not this list, is the boundary.
  const dangerous = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bimport\s*\(/,
    /\brequire\s*\(/,
    /\bdocument\s*\./,
    /\bwindow\s*\./,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bWebSocket\b/,
    /\bWorker\b/,
    /\.src\s*=/,
    /\.href\s*=/,
  ]

  for (const pattern of dangerous) {
    if (pattern.test(code)) {
      throw new Error(`Code contains potentially dangerous pattern: ${pattern.toString()}`)
    }
  }

  // Check it starts with function signature
  const trimmed = code.trim()
  if (!trimmed.startsWith('function createAsset')) {
    throw new Error('Code must start with "function createAsset(THREE, seed, textures)" or "function createAsset(THREE, seed, textures, params)"')
  }

  return true
}

/**
 * Normalize pasted or file-loaded creative code: strips markdown fences and
 * any leading header comments (the Export Code file starts with a comment
 * banner) so the text begins at the createAsset function, as validateCode
 * requires. Returns null when no createAsset function is present.
 */
export function normalizeCreativeCode(text) {
  if (typeof text !== 'string') {
    return null
  }

  let code = text.trim()
  if (code.startsWith('```')) {
    code = code.replace(/^```(?:javascript|js)?\n?/, '').replace(/\n?```$/, '')
  }

  const start = code.indexOf('function createAsset')
  if (start === -1) {
    return null
  }

  return code.slice(start).trim()
}

/**
 * Detect if code accepts params argument (4th parameter)
 */
function codeAcceptsParams(code) {
  const signatureMatch = code.match(/function\s+createAsset\s*\([^)]*\)/)
  if (signatureMatch) {
    const params = signatureMatch[0].match(/\(([^)]*)\)/)?.[1] || ''
    const argCount = params.split(',').filter(a => a.trim()).length
    return argCount >= 4
  }
  return false
}

/**
 * Detect if code accepts addons argument (5th parameter)
 */
function codeAcceptsAddons(code) {
  const signatureMatch = code.match(/function\s+createAsset\s*\([^)]*\)/)
  if (signatureMatch) {
    const params = signatureMatch[0].match(/\(([^)]*)\)/)?.[1] || ''
    const argCount = params.split(',').filter(a => a.trim()).length
    return argCount >= 5
  }
  return false
}

/**
 * Detect which addons are used in the code
 */
function detectUsedAddons(code) {
  const used = []

  if (/addons\.Water\b/.test(code) && !/addons\.Water2\b/.test(code.replace(/addons\.Water\b/g, ''))) {
    used.push('Water')
  }
  if (/addons\.Water2\b/.test(code)) {
    used.push('Water2')
  }
  if (/addons\.Sky\b/.test(code)) {
    used.push('Sky')
  }
  if (/addons\.Reflector\b/.test(code)) {
    used.push('Reflector')
  }
  if (/addons\.SimplexNoise\b/.test(code)) {
    used.push('SimplexNoise')
  }
  if (/addons\.textures\./.test(code)) {
    used.push('textures')
  }
  if (/addons\.createSkyWithSun\b/.test(code)) {
    used.push('Sky') // Helper uses Sky
  }
  if (/addons\.createWaterPlane\b/.test(code)) {
    used.push('Water') // Helper uses Water
  }

  return [...new Set(used)] // Remove duplicates
}

/**
 * Count triangles in an Object3D hierarchy
 */
function countTriangles(object) {
  let count = 0

  object.traverse((child) => {
    if (child.isMesh) {
      const geometry = child.geometry
      let meshTriangles = 0

      if (geometry.index) {
        meshTriangles = geometry.index.count / 3
      } else if (geometry.attributes.position) {
        meshTriangles = geometry.attributes.position.count / 3
      }

      // Account for instancing - multiply THIS mesh's triangles, not total
      if (child.isInstancedMesh) {
        meshTriangles *= child.count
      }

      count += meshTriangles
    }
  })

  return Math.round(count)
}

export function collectRuntimeSignals(object) {
  const bounds = new THREE.Box3().setFromObject(object)
  const size = bounds.getSize(new THREE.Vector3())
  let meshCount = 0
  let instancedMeshCount = 0
  const materialIds = new Set()

  object.traverse(child => {
    if (child.isMesh) {
      meshCount += 1
      if (child.isInstancedMesh) {
        instancedMeshCount += 1
      }

      if (Array.isArray(child.material)) {
        child.material.forEach(material => materialIds.add(material.uuid))
      } else if (child.material) {
        materialIds.add(child.material.uuid)
      }
    }
  })

  return {
    bounds: {
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
      size: [size.x, size.y, size.z]
    },
    meshCount,
    instancedMeshCount,
    materialCount: materialIds.size
  }
}

/**
 * Execute generated ThreeJS code
 * @param {string} code - The generated factory function code
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - The asset instance { root, update, dispose }
 */
export async function executeFactory(code, options = {}, three = THREE) {
  const {
    seed = Math.floor(Math.random() * 100000),
    textures = {},
    params = {},
    maxTriangles = MAX_TRIANGLES
  } = options

  // Validate code
  validateCode(code)

  // Check if code accepts params and addons
  const acceptsParams = codeAcceptsParams(code)
  const acceptsAddons = codeAcceptsAddons(code)
  const usedAddons = detectUsedAddons(code)

  // Create the factory function
  let createAsset
  try {
    // Wrap in IIFE to get the function
    const wrappedCode = `(${code})`
    createAsset = (0, eval)(wrappedCode)
  } catch (error) {
    throw new Error(`Failed to parse code: ${error.message}`)
  }

  if (typeof createAsset !== 'function') {
    throw new Error('Code did not produce a function')
  }

  // Execute with timeout
  let result
  try {
    // Factories may fill defaults or adjust inputs. Never expose the saved snapshot itself.
    const inputParams = structuredClone(params)
    const inputTextures = structuredClone(textures)
    result = await (() => {
      // Pass arguments based on what the function accepts
      if (acceptsAddons) {
        return createAsset(three, seed, inputTextures, inputParams, ADDONS)
      } else if (acceptsParams) {
        return createAsset(three, seed, inputTextures, inputParams)
      }
      return createAsset(three, seed, inputTextures)
    })()
  } catch (error) {
    throw new Error(`Execution failed: ${error.message}`)
  }

  // Validate result structure
  if (!result || typeof result !== 'object') {
    throw new Error('Function must return an object')
  }

  if (!result.root || !result.root.isObject3D) {
    if (typeof result.dispose === 'function') {
      try { result.dispose() } catch { /* Preserve the validation error. */ }
    }
    throw new Error('Result must have a "root" property that is a THREE.Object3D')
  }
  const dispose = createAssetDisposer(result, Object.values(ADDONS.textures || {}).filter(value => value?.isTexture))

  // Check triangle count
  const triangles = countTriangles(result.root)
  if (triangles > maxTriangles) {
    // Dispose before throwing
    try { dispose() } catch { /* Preserve the budget error. */ }
    throw new Error(`Triangle count (${triangles}) exceeds maximum (${maxTriangles})`)
  }

  // Get animation function - support both 'update' and 'tick' naming conventions
  const animationFn = typeof result.update === 'function'
    ? result.update
    : typeof result.tick === 'function'
      ? result.tick
      : null

  // Ensure update/tick and dispose functions exist
  const asset = {
    root: result.root,
    // Expose animation function as both 'tick' (for curated compatibility) and 'update' (for code convention)
    tick: animationFn || (() => {}),
    update: animationFn || (() => {}),
    dispose,
    isCodeGenerated: true,
    isProcedural: acceptsParams,
    usesAddons: acceptsAddons,
    usedAddons: usedAddons, // Array of addon names used
    hasAnimation: !!animationFn,
    triangleCount: triangles,
    runtimeSignals: collectRuntimeSignals(result.root)
  }

  return asset
}
