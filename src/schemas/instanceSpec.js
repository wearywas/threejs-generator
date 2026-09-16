import { z } from 'zod'

/**
 * Instance Specification Schema
 * 
 * Defines a batchable asset format that separates geometry/material definitions
 * from per-instance transforms. This enables the world generator to merge
 * all placements into minimal InstancedMesh objects (minimal draw calls).
 * 
 * Example: 87 grass placements × 4 meshes = 348 draw calls
 *       -> 87 placements merged = 3-4 draw calls (one per material type)
 */

// -----------------------------------------
// Geometry Definition Schema
// -----------------------------------------

const geometryTypeSchema = z.enum([
  'plane',
  'box',
  'sphere',
  'cylinder',
  'cone',
  'circle',
  'ring',
  'torus',
  'custom'
])

const geometrySchema = z.object({
  type: geometryTypeSchema,
  // Plane/Box
  width: z.number().optional(),
  height: z.number().optional(),
  depth: z.number().optional(),
  // Shared Plane/Box/Sphere segments (height also applies to Cylinder/Cone)
  widthSegments: z.number().int().optional(),
  heightSegments: z.number().int().optional(),
  // Sphere/Cylinder/Cone
  radius: z.number().optional(),
  radiusTop: z.number().optional(),
  radiusBottom: z.number().optional(),
  // Cylinder/Cone
  radialSegments: z.number().int().optional(),
  openEnded: z.boolean().optional(),
  // Circle/Ring
  innerRadius: z.number().optional(),
  outerRadius: z.number().optional(),
  thetaSegments: z.number().int().optional(),
  // Torus
  tube: z.number().optional(),
  tubularSegments: z.number().int().optional(),
  // Custom geometry (serialized buffer geometry)
  customData: z.object({
    position: z.array(z.number()).optional(),
    normal: z.array(z.number()).optional(),
    uv: z.array(z.number()).optional(),
    index: z.array(z.number()).optional()
  }).optional()
})

// -----------------------------------------
// Material Definition Schema
// -----------------------------------------

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color')

const materialSideSchema = z.enum(['front', 'back', 'double'])

const materialSchema = z.object({
  color: hexColor.default('#808080'),
  side: materialSideSchema.default('front'),
  transparent: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  roughness: z.number().min(0).max(1).default(0.5),
  metalness: z.number().min(0).max(1).default(0),
  emissive: hexColor.optional(),
  emissiveIntensity: z.number().min(0).optional(),
  // Texture references (paths or base64)
  map: z.string().optional(),
  normalMap: z.string().optional(),
  roughnessMap: z.string().optional(),
  // For custom shaders (future)
  customShader: z.object({
    vertexShader: z.string(),
    fragmentShader: z.string(),
    uniforms: z.record(z.any())
  }).optional()
})

// -----------------------------------------
// Mesh Definition Schema
// -----------------------------------------

const meshDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  geometry: geometrySchema,
  material: materialSchema,
  // Estimated instance count per clump (for pre-allocation)
  instanceCountHint: z.number().int().default(1)
})

// -----------------------------------------
// Instance Transform Schema
// -----------------------------------------

const instanceTransformSchema = z.object({
  meshId: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
  scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
  // Per-instance animation data
  animationData: z.record(z.any()).optional()
})

// -----------------------------------------
// Animation Specification Schema
// -----------------------------------------

const animationTypeSchema = z.enum([
  'none',
  'wind',          // Wind sway (grass, leaves)
  'wave',          // Wave motion (water, flags)
  'flutter',       // Flutter motion (butterflies, particles)
  'orbit',         // Orbital movement
  'custom'         // Custom animation function
])

const animationSpecSchema = z.object({
  type: animationTypeSchema.default('none'),
  // Animation parameters
  params: z.object({
    speed: z.number().default(1),
    strength: z.number().default(1),
    frequency: z.number().optional(),
    phase: z.number().optional(),
    direction: z.tuple([z.number(), z.number(), z.number()]).optional()
  }).default({}),
  // For 'custom' type - the animation function code
  customCode: z.string().optional(),
  // Animation mode
  mode: z.enum(['transform', 'shader']).default('transform')
})

// -----------------------------------------
// Structure Type Schema
// -----------------------------------------

/**
 * Structure type determines how instances are batched:
 * 
 * DISTRIBUTED: Asset contains many instances scattered randomly (e.g., grass clump)
 *   - Each mesh type is batched separately
 *   - instanceGeneratorCode returns random positions within clump radius
 *   - Good for: grass, particles, scattered vegetation
 * 
 * HIERARCHICAL: Asset is one coherent unit with parts (e.g., wildflower)
 *   - All parts must stay together at their relative positions
 *   - instanceGeneratorCode returns fixed relative transforms for all parts
 *   - Good for: flowers, trees, complex props
 */
const structureTypeSchema = z.enum(['distributed', 'hierarchical'])

// -----------------------------------------
// Instance Specification Schema (Main)
// -----------------------------------------

export const instanceSpecSchema = z.object({
  // Version for compatibility
  version: z.literal('1.0'),
  
  // Asset metadata
  name: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  
  // Structure type - determines batching behavior
  structureType: structureTypeSchema.default('hierarchical'),
  
  // Source info (for reference)
  source: z.object({
    generator: z.string().optional(),
    prompt: z.string().optional(),
    seed: z.number().int().optional()
  }).optional(),
  
  // Mesh definitions (shared geometry/materials)
  meshes: z.array(meshDefinitionSchema).min(1),
  
  // Instance generator function code
  // For DISTRIBUTED: (seed, params) => [{ meshId, position: random, rotation, scale }]
  // For HIERARCHICAL: (seed, params) => [{ meshId, position: fixed_relative, ... }]
  instanceGeneratorCode: z.string(),
  
  // Default parameters for instance generation
  defaultParams: z.record(z.any()).default({}),
  
  // Parameter schema for UI (optional)
  paramSchema: z.record(z.object({
    type: z.enum(['number', 'color', 'boolean', 'select']),
    default: z.any(),
    min: z.number().optional(),
    max: z.number().optional(),
    options: z.array(z.string()).optional(),
    description: z.string().optional()
  })).optional(),
  
  // Animation specification
  animation: animationSpecSchema.default({ type: 'none', params: {} }),
  
  // Bounding box hint (for culling/LOD)
  bounds: z.object({
    size: z.tuple([z.number(), z.number(), z.number()]),
    pivot: z.enum(['base', 'center']).default('base')
  }).optional(),
  
  // Performance hints
  performance: z.object({
    // Estimated instances per clump
    instancesPerClump: z.number().int().default(100),
    // Suggested LOD distance
    lodDistance: z.number().optional(),
    // Can be frustum culled
    frustumCullable: z.boolean().default(true)
  }).optional()
})

// -----------------------------------------
// Type exports for TypeScript support
// -----------------------------------------

/**
 * @typedef {z.infer<typeof instanceSpecSchema>} InstanceSpec
 * @typedef {z.infer<typeof meshDefinitionSchema>} MeshDefinition
 * @typedef {z.infer<typeof instanceTransformSchema>} InstanceTransform
 * @typedef {z.infer<typeof animationSpecSchema>} AnimationSpec
 * @typedef {z.infer<typeof geometrySchema>} GeometryDef
 * @typedef {z.infer<typeof materialSchema>} MaterialDef
 */

// -----------------------------------------
// Validation and Helper Functions
// -----------------------------------------

/**
 * Validate an instance specification
 * @param {Object} spec - The specification to validate
 * @returns {Object} - Validated specification with defaults applied
 */
export function validateInstanceSpec(spec) {
  return instanceSpecSchema.parse(spec)
}

/**
 * Create a minimal valid instance specification
 * @param {Object} options - Basic options
 * @returns {Object} - Valid minimal spec
 */
export function createMinimalSpec(options = {}) {
  return {
    version: '1.0',
    name: options.name || 'Untitled Asset',
    meshes: options.meshes || [{
      id: 'default',
      geometry: { type: 'box', width: 1, height: 1, depth: 1 },
      material: { color: '#808080' }
    }],
    instanceGeneratorCode: options.instanceGeneratorCode || 
      'function(seed, params) { return [{ meshId: "default", position: [0, 0, 0] }]; }',
    animation: { type: 'none', params: {} }
  }
}

/**
 * Convert THREE.js side constant to string
 * @param {number} side - THREE.FrontSide, THREE.BackSide, or THREE.DoubleSide
 * @returns {string}
 */
export function sideToString(side) {
  // THREE.FrontSide = 0, THREE.BackSide = 1, THREE.DoubleSide = 2
  const map = { 0: 'front', 1: 'back', 2: 'double' }
  return map[side] || 'front'
}

/**
 * Convert string to THREE.js side constant
 * @param {string} side - 'front', 'back', or 'double'
 * @returns {number}
 */
export function stringToSide(side) {
  const map = { front: 0, back: 1, double: 2 }
  return map[side] ?? 0
}

/**
 * Estimate the number of draw calls for an instance spec
 * @param {Object} spec - The instance specification
 * @param {number} placementCount - Number of world placements
 * @returns {{ batched: number, unbatched: number }}
 */
export function estimateDrawCalls(spec, placementCount = 1) {
  const meshCount = spec.meshes?.length || 1
  
  return {
    // With batching: one draw call per unique mesh definition
    batched: meshCount,
    // Without batching: meshes × placements
    unbatched: meshCount * placementCount
  }
}

// Export schemas for external use
export {
  geometrySchema,
  materialSchema,
  meshDefinitionSchema,
  instanceTransformSchema,
  animationSpecSchema,
  structureTypeSchema
}
