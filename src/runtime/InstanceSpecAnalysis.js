import * as THREE from 'three'
import { validateInstanceSpec, sideToString, createMinimalSpec } from '../schemas/instanceSpec.js'
import { executeFactory as executeCode } from './isolated/factory.js'

/**
 * InstanceSpecGenerator
 *
 * Converts existing createAsset code or curated generators into Instance Specifications
 * that can be batched by the world generator for minimal draw calls.
 *
 * The conversion process:
 * 1. Execute the createAsset code to create a template asset
 * 2. Detect asset structure (distributed vs hierarchical)
 * 3. Analyze the mesh structure (geometries, materials, transforms)
 * 4. Extract instance distribution patterns OR hierarchical transforms
 * 5. Generate an Instance Specification that describes everything declaratively
 *
 * Asset Structure Types:
 * - DISTRIBUTED: Asset contains InstancedMesh(es) with many instances scattered randomly
 *   (e.g., grass clump with 200 blades). Each mesh type is batched separately.
 *
 * - HIERARCHICAL: Asset contains individual meshes forming one coherent "unit"
 *   (e.g., wildflower with stem + petals + leaves). All parts must stay together
 *   at their relative positions when batched.
 */

/**
 * Detect if an asset is distributed (many random instances) or hierarchical (parts forming one unit)
 * @param {THREE.Object3D} root - The asset root object
 * @returns {'distributed' | 'hierarchical'} - The asset structure type
 */
export function detectAssetStructure(root) {
  let instancedMeshCount = 0
  let regularMeshCount = 0
  let totalInstancedCount = 0
  let onlyScatterMeshes = true

  root.traverse((child) => {
    if (child.isInstancedMesh) {
      instancedMeshCount++
      totalInstancedCount += child.count
      const words = getSemanticWords(child.name || '')
      if (!['grass', 'particle', 'particles'].some(word => words.has(word))) {
        onlyScatterMeshes = false
      }
    } else if (child.isMesh && !child.isInstancedMesh) {
      regularMeshCount++
    }
  })

  console.log(`[InstanceSpecGenerator] Structure analysis: ${instancedMeshCount} InstancedMesh(es) with ${totalInstancedCount} total instances, ${regularMeshCount} regular meshes`)

  // Instancing is a rendering optimization, not evidence of random placement.
  // Only clearly named scatter-only assets use the approximate scatter generator.
  // Ambiguous names and mixed assemblies preserve their existing transforms.
  if (instancedMeshCount > 0 && totalInstancedCount > 10 && regularMeshCount === 0 && onlyScatterMeshes) {
    return 'distributed'
  }

  // Hierarchical: Multiple regular meshes forming one coherent unit
  // These assets have parts that must stay together at relative positions
  return 'hierarchical'
}

/**
 * Extract hierarchical transforms - captures the exact relative position/rotation/scale
 * of each mesh relative to the asset root. Used for hierarchical assets where all parts
 * must maintain their spatial relationship when batched.
 *
 * @param {THREE.Object3D} root - The asset root object
 * @param {Array} meshDefinitions - The mesh definitions from analyzeMeshStructure
 * @param {Map} meshMergeMapping - Optional mapping from original mesh IDs to merged mesh IDs
 * @returns {Array<Object>} - Array of instance transforms with meshId, position, rotation, scale
 */
export function extractHierarchicalTransforms(root, meshDefinitions, meshMergeMapping = null) {
  const transforms = []
  let meshIndex = 0

  // Make sure the root's matrix is up to date
  root.updateMatrixWorld(true)

  root.traverse((child) => {
    if (child.isMesh) {
      // Calculate transform relative to root
      const localMatrix = new THREE.Matrix4()

      if (child.parent === root) {
        // Direct child - use local matrix
        child.updateMatrix()
        localMatrix.copy(child.matrix)
      } else {
        // Nested child - calculate relative transform from world matrices
        const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert()
        localMatrix.multiplyMatrices(rootInverse, child.matrixWorld)
      }

      // Get the mesh ID, applying merge mapping if provided
      // This groups meshes with the same material together to reduce draw calls
      let meshId = `mesh_${meshIndex}`
      if (meshMergeMapping && meshMergeMapping.has(meshId)) {
        meshId = meshMergeMapping.get(meshId)
      }

      // Match analyzeMeshStructure's mesh IDs while preserving every instance.
      const count = child.isInstancedMesh ? child.count : 1
      for (let i = 0; i < count; i++) {
        const transform = localMatrix.clone()
        if (child.isInstancedMesh) {
          const instanceMatrix = new THREE.Matrix4()
          child.getMatrixAt(i, instanceMatrix)
          transform.multiply(instanceMatrix)
        }
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        transform.decompose(position, quaternion, scale)
        const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')

        transforms.push({
          meshId,
          position: [position.x, position.y, position.z].map(value => Math.round(value * 10000) / 10000),
          rotation: [euler.x, euler.y, euler.z].map(value => Math.round(value * 10000) / 10000),
          scale: [scale.x, scale.y, scale.z].map(value => Math.round(value * 10000) / 10000)
        })
      }

      meshIndex++
    }
  })

  console.log(`[InstanceSpecGenerator] Extracted ${transforms.length} hierarchical transforms` +
    (meshMergeMapping ? ` (with material merge mapping)` : ''))
  return transforms
}

/**
 * Generate an Instance Specification from createAsset code
 * @param {string} code - The createAsset function code
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} - The instance specification
 */
export async function generateInstanceSpec(code, options = {}, existingAsset = null) {
  const {
    name = 'Generated Asset',
    seed = 12345,
    params = {},
    textures = {},
    prompt = '',
    mergeMeshesByMaterial = true  // NEW: Option to merge meshes with same material to reduce draw calls
  } = options

  // Execute the code to create a template asset
  const asset = existingAsset || await executeCodeForAnalysis(code, { seed, params, textures })

  try {
    if (!asset || !asset.root) {
      throw new Error('Failed to create asset for analysis')
    }

    // Detect the asset structure type (distributed vs hierarchical)
    const structureType = detectAssetStructure(asset.root)
    console.log(`[InstanceSpecGenerator] Detected structure type: ${structureType}`)

    // Analyze the mesh structure
    let meshAnalysis = analyzeMeshStructure(asset.root)

    // For hierarchical assets, optionally merge meshes by material to reduce draw calls
    // This groups all meshes with the same material into a single mesh definition
    let meshMergeMapping = null
    if (structureType === 'hierarchical' && mergeMeshesByMaterial && meshAnalysis.meshDefinitions.length > 1) {
      const mergeResult = mergeMeshDefinitionsByMaterial(meshAnalysis.meshDefinitions)
      meshAnalysis = {
        meshDefinitions: mergeResult.mergedMeshDefinitions,
        totalInstanceCount: meshAnalysis.totalInstanceCount
      }
      meshMergeMapping = mergeResult.mapping
      console.log(`[InstanceSpecGenerator] Merged ${mergeResult.originalCount} meshes into ${mergeResult.mergedMeshDefinitions.length} groups by material`)
    }

    // Detect animation type
    const animationType = detectAnimationType(asset)

    // Extract hierarchical transforms if applicable
    let hierarchicalTransforms = null
    if (structureType === 'hierarchical') {
      hierarchicalTransforms = extractHierarchicalTransforms(asset.root, meshAnalysis.meshDefinitions, meshMergeMapping)
    }

    // Extract the instance generator code based on structure type
    const instanceGeneratorCode = extractInstanceGeneratorCode(code, meshAnalysis, structureType, hierarchicalTransforms)

    // Extract default parameters from code
    const defaultParams = extractDefaultParams(code)

    // Build the instance specification
    const spec = {
      version: '1.0',
      name: sanitizeSpecName(name),
      description: prompt ? `Generated from prompt: "${prompt}"` : undefined,

      // NEW: Include structure type so consumers know how to handle this asset
      structureType,

      source: {
        generator: 'creative',
        prompt: prompt || undefined,
        seed
      },

      meshes: meshAnalysis.meshDefinitions,

      instanceGeneratorCode,

      defaultParams,

      animation: {
        type: animationType,
        params: extractAnimationParams(code, animationType),
        mode: 'transform'
      },

      bounds: calculateBounds(asset.root),

      performance: {
        instancesPerClump: meshAnalysis.totalInstanceCount,
        frustumCullable: true
      }
    }

    // Validate and return
    try {
      return validateInstanceSpec(spec)
    } catch (error) {
      console.warn('[InstanceSpecGenerator] Validation warning:', error.message)
      // Return unvalidated spec if validation fails (allow partial specs)
      return spec
    }
  } finally {
    if (!existingAsset) asset?.dispose?.()
  }
}

/**
 * Execute createAsset code in a controlled environment for analysis
 */
async function executeCodeForAnalysis(code, options) {
  const { seed, params, textures } = options

  // Normalize code
  const normalizedCode = normalizeCode(code)

  // Validate basic structure
  if (!/function\s+createAsset\s*\(/.test(normalizedCode)) {
    throw new Error('Code must contain a createAsset function')
  }

  try {
    return await executeCode(normalizedCode, {
      seed,
      params,
      textures,
      maxTriangles: Infinity
    })
  } catch (error) {
    console.error('[InstanceSpecGenerator] Execution error:', error)
    throw error
  }
}

/**
 * Normalize code by removing BOM and other invisible characters
 */
function normalizeCode(code) {
  if (code.charCodeAt(0) === 0xFEFF) {
    code = code.slice(1)
  }
  return code.replace(/[\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g, '').replace(/\u00A0/g, ' ')
}

/**
 * Analyze the mesh structure of an asset
 */
function analyzeMeshStructure(root) {
  const meshDefinitions = []
  const meshMap = new Map() // Track unique geometry/material combinations
  let totalInstanceCount = 0
  let meshIndex = 0

  root.traverse((child) => {
    if (child.isInstancedMesh) {
      // InstancedMesh - extract geometry and material
      const geometryDef = extractGeometryDefinition(child.geometry)
      const materialDef = extractMaterialDefinition(child.material)

      const meshId = `mesh_${meshIndex++}`

      meshDefinitions.push({
        id: meshId,
        name: child.name || meshId,
        geometry: geometryDef,
        material: materialDef,
        instanceCountHint: child.count
      })

      totalInstanceCount += child.count

    } else if (child.isMesh && !child.isInstancedMesh) {
      // Regular mesh - treat as single instance
      const geometryDef = extractGeometryDefinition(child.geometry)
      const materialDef = extractMaterialDefinition(child.material)

      const meshId = `mesh_${meshIndex++}`

      meshDefinitions.push({
        id: meshId,
        name: child.name || meshId,
        geometry: geometryDef,
        material: materialDef,
        instanceCountHint: 1
      })

      totalInstanceCount += 1
    }
  })

  return {
    meshDefinitions,
    totalInstanceCount
  }
}

/**
 * Generate a material signature for grouping meshes by material
 * Meshes with the same signature can be merged to reduce draw calls
 */
function getMaterialSignature(materialDef) {
  // Require identical serialized definitions, including nested rendering data.
  // Different key order may miss a merge, but must never erase material differences.
  return JSON.stringify(materialDef)
}

function getGeometrySignature(geometryDef) {
  return JSON.stringify(geometryDef)
}

/**
 * Merge mesh definitions that share the same material
 * This reduces draw calls by batching meshes with identical materials
 *
 * @param {Array} meshDefinitions - Original mesh definitions
 * @returns {{ mergedMeshDefinitions: Array, mapping: Map, originalCount: number }}
 */
export function mergeMeshDefinitionsByMaterial(meshDefinitions) {
  const materialGroups = new Map() // material+geometry signature -> { material, meshes: [], ids: [] }

  // Group meshes by material signature
  for (const meshDef of meshDefinitions) {
    const signature = JSON.stringify({
      material: getMaterialSignature(meshDef.material),
      geometry: getGeometrySignature(meshDef.geometry)
    })

    if (!materialGroups.has(signature)) {
      materialGroups.set(signature, {
        material: meshDef.material,
        meshes: [],
        ids: []
      })
    }

    const group = materialGroups.get(signature)
    group.meshes.push(meshDef)
    group.ids.push(meshDef.id)
  }

  // Create merged mesh definitions (one per unique material)
  const mergedMeshDefinitions = []
  const mapping = new Map() // originalMeshId -> mergedMeshId

  let mergedIndex = 0
  for (const [signature, group] of materialGroups) {
    const mergedId = `material_group_${mergedIndex++}`

    // Geometry is included in the grouping key, so the representative geometry is safe.
    const representative = group.meshes[0]

    // Track how many original meshes were merged into this group
    const mergedCount = group.meshes.length

    mergedMeshDefinitions.push({
      id: mergedId,
      name: mergedCount > 1
        ? `merged_${mergedCount}_meshes_${representative.material.color || 'default'}`
        : representative.name,
      geometry: representative.geometry,
      material: group.material,
      instanceCountHint: group.meshes.reduce((count, mesh) => count + (mesh.instanceCountHint ?? 1), 0),
      // NEW: Track original mesh IDs for hierarchical transform mapping
      mergedFrom: group.ids
    })

    // Map all original IDs to the merged ID
    for (const originalId of group.ids) {
      mapping.set(originalId, mergedId)
    }
  }

  console.log(`[MergeMeshes] Material groups: ${materialGroups.size}, ` +
    `colors: ${Array.from(materialGroups.values()).map(g => g.material.color).join(', ')}`)

  return {
    mergedMeshDefinitions,
    mapping,
    originalCount: meshDefinitions.length
  }
}

/**
 * Extract geometry definition from THREE.BufferGeometry
 */
function extractGeometryDefinition(geometry) {
  // Try to detect common geometry types
  const type = geometry.type || 'BufferGeometry'
  const params = geometry.parameters || {}

  // Map THREE geometry types to our schema
  if (type === 'PlaneGeometry' || type === 'PlaneBufferGeometry') {
    return {
      type: 'plane',
      width: params.width || 1,
      height: params.height || 1,
      widthSegments: params.widthSegments,
      heightSegments: params.heightSegments
    }
  }

  if (type === 'BoxGeometry' || type === 'BoxBufferGeometry') {
    return {
      type: 'box',
      width: params.width || 1,
      height: params.height || 1,
      depth: params.depth || 1
    }
  }

  if (type === 'SphereGeometry' || type === 'SphereBufferGeometry') {
    return {
      type: 'sphere',
      radius: params.radius || 1,
      widthSegments: params.widthSegments || 32,
      heightSegments: params.heightSegments || 16
    }
  }

  if (type === 'CylinderGeometry' || type === 'CylinderBufferGeometry') {
    return {
      type: 'cylinder',
      radiusTop: params.radiusTop || 1,
      radiusBottom: params.radiusBottom || 1,
      height: params.height || 1,
      radialSegments: params.radialSegments || 8
    }
  }

  if (type === 'ConeGeometry' || type === 'ConeBufferGeometry') {
    return {
      type: 'cone',
      radius: params.radius || 1,
      height: params.height || 1,
      radialSegments: params.radialSegments || 8
    }
  }

  if (type === 'CircleGeometry' || type === 'CircleBufferGeometry') {
    return {
      type: 'circle',
      radius: params.radius || 1,
      thetaSegments: params.segments || 32
    }
  }

  if (type === 'RingGeometry' || type === 'RingBufferGeometry') {
    return {
      type: 'ring',
      innerRadius: params.innerRadius || 0.5,
      outerRadius: params.outerRadius || 1,
      thetaSegments: params.thetaSegments || 32
    }
  }

  if (type === 'TorusGeometry' || type === 'TorusBufferGeometry') {
    return {
      type: 'torus',
      radius: params.radius || 1,
      tube: params.tube || 0.4,
      radialSegments: params.radialSegments || 8,
      tubularSegments: params.tubularSegments || 6
    }
  }

  // Custom geometry - serialize buffer attributes
  return {
    type: 'custom',
    customData: serializeBufferGeometry(geometry)
  }
}

/**
 * Serialize a BufferGeometry to transferable format
 */
function serializeBufferGeometry(geometry) {
  const data = {}

  const positionAttr = geometry.getAttribute('position')
  if (positionAttr) {
    data.position = Array.from(positionAttr.array)
  }

  const normalAttr = geometry.getAttribute('normal')
  if (normalAttr) {
    data.normal = Array.from(normalAttr.array)
  }

  const uvAttr = geometry.getAttribute('uv')
  if (uvAttr) {
    data.uv = Array.from(uvAttr.array)
  }

  if (geometry.index) {
    data.index = Array.from(geometry.index.array)
  }

  return data
}

/**
 * Extract material definition from THREE.Material
 */
function extractMaterialDefinition(material) {
  // Handle material arrays
  if (Array.isArray(material)) {
    material = material[0]
  }

  const def = {
    color: colorToHex(material.color),
    side: sideToString(material.side),
    transparent: material.transparent || false,
    opacity: material.opacity ?? 1
  }

  // Standard material properties
  if (material.roughness !== undefined) {
    def.roughness = material.roughness
  }
  if (material.metalness !== undefined) {
    def.metalness = material.metalness
  }
  if (material.emissive) {
    def.emissive = colorToHex(material.emissive)
    def.emissiveIntensity = material.emissiveIntensity || 1
  }

  return def
}

/**
 * Convert THREE.Color to hex string
 */
function colorToHex(color) {
  if (!color) return '#808080'
  if (typeof color === 'string') return color
  if (color.isColor) {
    return '#' + color.getHexString()
  }
  return '#808080'
}

function sanitizeSpecName(name) {
  if (typeof name === 'string' && name.trim()) {
    return name.trim()
  }

  if (typeof name === 'function' && name.name) {
    return name.name
  }

  return 'Generated Asset'
}

/**
 * Split semantic words without treating identifiers such as frontWindow as wind.
 */
function getSemanticWords(text) {
  return new Set(text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z]+/g) || [])
}

/**
 * Use runtime capability first; infer a known motion only from the live callback.
 * Unrecognized callbacks remain custom, not an assumed wind animation.
 */
function detectAnimationType(asset) {
  // executeFactory supplies no-op callbacks even when the asset is static.
  if (asset.hasAnimation === false) return 'none'
  const animation = typeof asset.update === 'function' ? asset.update : asset.tick
  if (typeof animation !== 'function') return asset.hasAnimation === true ? 'custom' : 'none'

  const words = getSemanticWords(animation.toString())

  if (words.has('wind') || words.has('sway')) {
    return 'wind'
  }

  if (words.has('wave')) {
    return 'wave'
  }

  if (words.has('flutter') || words.has('butterfly') || words.has('flap')) {
    return 'flutter'
  }

  if (words.has('orbit') || words.has('rotate') && words.has('around')) {
    return 'orbit'
  }

  return 'custom'
}

/**
 * Extract animation parameters from code
 */
function extractAnimationParams(code, animationType) {
  const params = {
    speed: 1,
    strength: 1
  }

  // Try to extract windSpeed/windStrength patterns
  const speedMatch = code.match(/(?:wind|animation|anim)?Speed\s*[=:]\s*(?:params\.(?:wind|animation)?Speed\s*\?\?\s*)?(\d+\.?\d*)/i)
  if (speedMatch) {
    params.speed = parseFloat(speedMatch[1])
  }

  const strengthMatch = code.match(/(?:wind|animation|anim)?Strength\s*[=:]\s*(?:params\.(?:wind|animation)?Strength\s*\?\?\s*)?(\d+\.?\d*)/i)
  if (strengthMatch) {
    params.strength = parseFloat(strengthMatch[1])
  }

  return params
}

/**
 * Extract the instance generator code from createAsset
 * This creates a function that returns instance transforms
 *
 * For DISTRIBUTED assets: Generates random scatter within clump radius
 * For HIERARCHICAL assets: Returns fixed relative positions for all parts
 *
 * @param {string} code - Original createAsset code
 * @param {Object} meshAnalysis - Analyzed mesh structure
 * @param {string} structureType - 'distributed' or 'hierarchical'
 * @param {Array|null} hierarchicalTransforms - Extracted transforms for hierarchical assets
 * @returns {string} - Generated instanceGeneratorCode
 */
function extractInstanceGeneratorCode(code, meshAnalysis, structureType = 'distributed', hierarchicalTransforms = null) {
  const meshIds = meshAnalysis.meshDefinitions.map(m => m.id)
  const instanceCounts = meshAnalysis.meshDefinitions.map(m => m.instanceCountHint)

  // HIERARCHICAL: All parts stay together at their relative positions
  // One "instance" = one complete unit (flower, tree, etc.) with all its parts
  if (structureType === 'hierarchical' && hierarchicalTransforms && hierarchicalTransforms.length > 0) {
    const transformsJSON = JSON.stringify(hierarchicalTransforms, null, 4)

    return `function generateInstances(seed, params) {
  // HIERARCHICAL ASSET: All parts maintain their relative positions
  // This asset is a single coherent unit (e.g., flower with stem + petals)
  // When batched, each "placement" creates one complete unit

  // Fixed transforms for all parts of this asset
  // These are the exact relative positions from the original asset
  const transforms = ${transformsJSON};

  // Return all parts - they will be placed together at the world position
  // The batcher handles adding the world offset to each part's position
  return transforms.map(t => ({
    ...t,
    animationData: {
      windPhase: 0,
      windStrength: 0.5
    }
  }));
}`
  }

  // DISTRIBUTED: Random scatter within clump radius (grass, particles, etc.)
  // Each mesh type is distributed independently across the clump area
  return `function generateInstances(seed, params) {
  // DISTRIBUTED ASSET: Instances scattered randomly within clump
  // Each mesh type has its own random distribution

  // Seeded random for deterministic generation
  function seededRandom(s) {
    let state = s;
    return function() {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }

  const random = seededRandom(seed);
  const instances = [];

  // Instance generation per mesh type
  ${meshIds.map((id, i) => {
    const count = instanceCounts[i]
    return `
  // ${id}: ${count} instances
  for (let i = 0; i < ${count}; i++) {
    const angle = random() * Math.PI * 2;
    const distance = random() * (params.clumpRadius || 1.0);
    instances.push({
      meshId: '${id}',
      position: [
        Math.cos(angle) * distance,
        random() * (params.height || 0.5) * 0.5,
        Math.sin(angle) * distance
      ],
      rotation: [
        (random() - 0.5) * 0.3,
        random() * Math.PI * 2,
        (random() - 0.5) * 0.3
      ],
      scale: [
        0.7 + random() * 0.6,
        0.5 + random() * (params.height || 0.5),
        1
      ],
      animationData: {
        windPhase: random() * Math.PI * 2,
        windStrength: 0.4 + random() * 0.8
      }
    });
  }`
  }).join('\n')}

  return instances;
}`
}

/**
 * Extract default parameters from code
 */
function extractDefaultParams(code) {
  const params = {}

  // Match patterns like: const paramName = params.paramName ?? defaultValue
  const paramPattern = /const\s+(\w+)\s*=\s*params\.(\w+)\s*\?\?\s*([^;]+)/g
  let match

  while ((match = paramPattern.exec(code)) !== null) {
    const [, varName, paramName, defaultValue] = match

    // Try to parse the default value
    try {
      // Handle string values
      if (defaultValue.trim().startsWith("'") || defaultValue.trim().startsWith('"')) {
        params[paramName] = defaultValue.trim().replace(/^['"]|['"]$/g, '')
      }
      // Handle numeric values
      else if (/^[\d.]+$/.test(defaultValue.trim())) {
        params[paramName] = parseFloat(defaultValue.trim())
      }
      // Handle boolean values
      else if (defaultValue.trim() === 'true' || defaultValue.trim() === 'false') {
        params[paramName] = defaultValue.trim() === 'true'
      }
    } catch (e) {
      // Skip unparseable values
    }
  }

  return params
}

/**
 * Calculate bounds from an Object3D
 */
function calculateBounds(object) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())

  // Determine pivot based on min Y
  const pivot = Math.abs(box.min.y) < 0.1 ? 'base' : 'center'

  return {
    size: [size.x, size.y, size.z],
    pivot
  }
}

/**
 * Convert a curated generator spec to instance spec
 * @param {Object} spec - The curated generator spec
 * @param {Function} generatorFn - The generator function
 * @returns {Promise<Object>} - Instance specification
 */
export async function convertCuratedToInstanceSpec(spec, generatorFn) {
  // Create the asset using the curated generator
  const result = generatorFn(spec.params, spec.seed, {})

  if (!result || !result.root) {
    throw new Error('Generator did not produce a valid asset')
  }

  // Analyze mesh structure
  const meshAnalysis = analyzeMeshStructure(result.root)

  // Build specification
  const instanceSpec = {
    version: '1.0',
    name: spec.generator,

    source: {
      generator: spec.generator,
      seed: spec.seed
    },

    meshes: meshAnalysis.meshDefinitions,

    // For curated generators, we can reference the generator directly
    instanceGeneratorCode: `function generateInstances(seed, params) {
  // This asset uses the curated '${spec.generator}' generator
  // For full batching support, use the creative mode version
  return [{ meshId: 'root', position: [0, 0, 0] }];
}`,

    defaultParams: spec.params,

    animation: {
      type: result.tick ? 'custom' : 'none',
      params: {},
      mode: 'transform'
    },

    bounds: calculateBounds(result.root),

    performance: {
      instancesPerClump: meshAnalysis.totalInstanceCount,
      frustumCullable: true
    }
  }

  // Cleanup
  if (result.dispose) {
    result.dispose()
  }

  return instanceSpec
}
