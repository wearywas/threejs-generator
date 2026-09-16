import { z } from 'zod'

// Color validation (hex string)
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color')

// -----------------------------------------
// Individual Generator Schemas
// -----------------------------------------

export const butterflySwarmSchema = z.object({
  generator: z.literal('butterflySwarm'),
  params: z.object({
    count: z.number().int().min(1).max(50).default(10),
    colors: z.array(hexColor).min(1).max(6).default(['#ff6b9d', '#ffd93d', '#6bcbff']),
    flightRadius: z.number().min(0.5).max(10).default(3),
    speed: z.number().min(0.1).max(5).default(1),
    wingSpan: z.number().min(0.1).max(1).default(0.3),
    heightVariation: z.number().min(0).max(5).default(1.5)
  }),
  seed: z.number().int().default(() => Math.floor(Math.random() * 100000))
})

export const proceduralTreeSchema = z.object({
  generator: z.literal('proceduralTree'),
  params: z.object({
    height: z.number().min(1).max(15).default(5),
    trunkRadius: z.number().min(0.1).max(1).default(0.3),
    trunkColor: hexColor.default('#8B4513'),
    foliageColor: hexColor.default('#228B22'),
    foliageType: z.enum(['sphere', 'cone', 'layered', 'broadleaf']).default('broadleaf'),
    leafCount: z.number().int().min(20).max(500).default(150),
    windSway: z.boolean().default(true),
    swayAmount: z.number().min(0).max(0.5).default(0.1)
  }),
  seed: z.number().int().default(() => Math.floor(Math.random() * 100000))
})

export const particleSystemSchema = z.object({
  generator: z.literal('particleSystem'),
  params: z.object({
    type: z.enum(['fireflies', 'snow', 'embers', 'dust', 'sparkles']).default('fireflies'),
    count: z.number().int().min(10).max(1000).default(100),
    area: z.number().min(1).max(20).default(5),
    color: hexColor.default('#ffff00'),
    secondaryColor: hexColor.optional(),
    speed: z.number().min(0.1).max(5).default(1),
    size: z.number().min(0.01).max(0.5).default(0.1),
    glow: z.boolean().default(true)
  }),
  seed: z.number().int().default(() => Math.floor(Math.random() * 100000))
})

export const simpleBuildingSchema = z.object({
  generator: z.literal('simpleBuilding'),
  params: z.object({
    style: z.enum(['cottage', 'tower', 'shed', 'cabin']).default('cottage'),
    width: z.number().min(1).max(10).default(4),
    depth: z.number().min(1).max(10).default(3),
    height: z.number().min(1).max(8).default(3),
    wallColor: hexColor.default('#d4a574'),
    roofColor: hexColor.default('#8b4513'),
    roofType: z.enum(['gabled', 'flat', 'pointed']).default('gabled'),
    hasChimney: z.boolean().default(true),
    hasDoor: z.boolean().default(true),
    hasWindows: z.boolean().default(true)
  }),
  seed: z.number().int().default(() => Math.floor(Math.random() * 100000))
})

export const rockClusterSchema = z.object({
  generator: z.literal('rockCluster'),
  params: z.object({
    count: z.number().int().min(1).max(20).default(5),
    minSize: z.number().min(0.1).max(2).default(0.3),
    maxSize: z.number().min(0.2).max(5).default(1.5),
    spread: z.number().min(0.5).max(10).default(3),
    color: hexColor.default('#808080'),
    roughness: z.number().min(0).max(1).default(0.8),
    mossAmount: z.number().min(0).max(1).default(0.2),
    mossColor: hexColor.default('#3a5f0b')
  }),
  seed: z.number().int().default(() => Math.floor(Math.random() * 100000))
})

export const buildingModularSchema = z.object({
  generator: z.literal('buildingModular'),
  params: z.object({
    footprint: z.object({
      shape: z.enum(['rectangle', 'L', 'U']).default('rectangle'),
      width: z.number().min(3).max(30).default(10),
      depth: z.number().min(3).max(30).default(8)
    }).default({ shape: 'rectangle', width: 10, depth: 8 }),
    floors: z.number().int().min(1).max(10).default(2),
    archetype: z.enum(['custom', 'cottage', 'watchtower', 'ruin', 'timberHouse', 'smallShop']).default('custom'),
    styleKit: z.enum(['modern_glass', 'industrial_brick', 'medieval_timber', 'coastal_wood', 'fantasy_stone']).default('industrial_brick'),
    windowDensity: z.enum(['sparse', 'normal', 'dense']).default('normal'),
    doorPlacement: z.enum(['center', 'side', 'double']).default('center'),
    roofType: z.enum(['flat', 'gable', 'hip', 'cone']).default('gable'),
    hasChimney: z.boolean().default(false),
    hasFoundation: z.boolean().default(true),
    hasCornice: z.boolean().default(true),
    weathering: z.number().min(0).max(1).default(0)
  }),
  seed: z.number().int().default(() => Math.floor(Math.random() * 100000))
})

export const environmentScatterSchema = z.object({
  generator: z.literal('environmentScatter'),
  params: z.object({
    area: z.number().min(5).max(100).default(20),
    propType: z.enum(['tree', 'rock', 'grass', 'bush', 'flower']).default('tree'),
    density: z.number().min(0.1).max(1).default(0.5),
    minDistance: z.number().min(0.5).max(10).default(2),
    clearingRadius: z.number().min(0).max(20).default(0),
    scaleVariation: z.number().min(0).max(1).default(0.3),
    colorVariation: z.number().min(0).max(1).default(0.1)
  }),
  seed: z.number().int().default(() => Math.floor(Math.random() * 100000))
})

// -----------------------------------------
// Combined Schema (union of all generators)
// -----------------------------------------

export const assetSpecSchema = z.discriminatedUnion('generator', [
  butterflySwarmSchema,
  proceduralTreeSchema,
  particleSystemSchema,
  simpleBuildingSchema,
  rockClusterSchema,
  buildingModularSchema,
  environmentScatterSchema
])

// -----------------------------------------
// Schema metadata for UI and LLM
// -----------------------------------------

export const generatorSchemas = {
  butterflySwarm: {
    name: 'Butterfly Swarm',
    description: 'A flock of colorful butterflies with flapping wings',
    params: {
      count: { type: 'number', step: 1, min: 1, max: 50, default: 10, description: 'Number of butterflies' },
      colors: { type: 'colors', default: ['#ff6b9d', '#ffd93d', '#6bcbff'], description: 'Wing colors' },
      flightRadius: { type: 'number', min: 0.5, max: 10, default: 3, description: 'Flight area radius' },
      speed: { type: 'number', min: 0.1, max: 5, default: 1, description: 'Animation speed' },
      wingSpan: { type: 'number', min: 0.1, max: 1, default: 0.3, description: 'Wing size' },
      heightVariation: { type: 'number', min: 0, max: 5, default: 1.5, description: 'Vertical movement range' }
    },
    textureSlots: [
      { id: 'wingTexture', label: 'Wing Pattern', accept: 'image/png,image/jpeg', description: 'Custom wing texture (transparent PNG)' }
    ]
  },
  proceduralTree: {
    name: 'Procedural Tree',
    description: 'A stylized tree with trunk and foliage',
    params: {
      height: { type: 'number', min: 1, max: 15, default: 5, description: 'Tree height' },
      trunkRadius: { type: 'number', min: 0.1, max: 1, default: 0.3, description: 'Trunk thickness' },
      trunkColor: { type: 'color', default: '#8B4513', description: 'Trunk color' },
      foliageColor: { type: 'color', default: '#228B22', description: 'Leaf color' },
      foliageType: { type: 'select', options: ['sphere', 'cone', 'layered', 'broadleaf'], default: 'broadleaf', description: 'Foliage shape' },
      leafCount: { type: 'number', step: 1, min: 20, max: 500, default: 150, description: 'Number of leaves' },
      windSway: { type: 'boolean', default: true, description: 'Enable wind animation' },
      swayAmount: { type: 'number', min: 0, max: 0.5, default: 0.1, description: 'Wind sway intensity' }
    },
    textureSlots: [
      { id: 'foliageTexture', label: 'Leaf Texture', accept: 'image/png,image/jpeg', description: 'Custom leaf texture' },
      { id: 'barkTexture', label: 'Bark Texture', accept: 'image/png,image/jpeg', description: 'Custom bark texture' }
    ]
  },
  particleSystem: {
    name: 'Particle System',
    description: 'Animated floating particles (fireflies, snow, etc.)',
    params: {
      type: { type: 'select', options: ['fireflies', 'snow', 'embers', 'dust', 'sparkles'], default: 'fireflies', description: 'Particle behavior type' },
      count: { type: 'number', step: 1, min: 10, max: 1000, default: 100, description: 'Number of particles' },
      area: { type: 'number', min: 1, max: 20, default: 5, description: 'Spawn area size' },
      color: { type: 'color', default: '#ffff00', description: 'Primary color' },
      speed: { type: 'number', min: 0.1, max: 5, default: 1, description: 'Movement speed' },
      size: { type: 'number', min: 0.01, max: 0.5, default: 0.1, description: 'Particle size' },
      glow: { type: 'boolean', default: true, description: 'Enable glow effect' }
    },
    textureSlots: [
      { id: 'particleTexture', label: 'Particle Sprite', accept: 'image/png', description: 'Custom particle sprite (transparent PNG)' }
    ]
  },
  simpleBuilding: {
    name: 'Simple Building',
    description: 'A basic building structure (cottage, tower, shed)',
    params: {
      style: { type: 'select', options: ['cottage', 'tower', 'shed', 'cabin'], default: 'cottage', description: 'Building style' },
      width: { type: 'number', min: 1, max: 10, default: 4, description: 'Building width' },
      depth: { type: 'number', min: 1, max: 10, default: 3, description: 'Building depth' },
      height: { type: 'number', min: 1, max: 8, default: 3, description: 'Wall height' },
      wallColor: { type: 'color', default: '#d4a574', description: 'Wall color' },
      roofColor: { type: 'color', default: '#8b4513', description: 'Roof color' },
      roofType: { type: 'select', options: ['gabled', 'flat', 'pointed'], default: 'gabled', description: 'Roof style' },
      hasChimney: { type: 'boolean', default: true, description: 'Add chimney' },
      hasDoor: { type: 'boolean', default: true, description: 'Add door' },
      hasWindows: { type: 'boolean', default: true, description: 'Add windows' }
    },
    textureSlots: [
      { id: 'wallTexture', label: 'Wall Texture', accept: 'image/png,image/jpeg', description: 'Custom wall texture' },
      { id: 'roofTexture', label: 'Roof Texture', accept: 'image/png,image/jpeg', description: 'Custom roof texture' }
    ]
  },
  rockCluster: {
    name: 'Rock Cluster',
    description: 'A group of natural-looking rocks',
    params: {
      count: { type: 'number', step: 1, min: 1, max: 20, default: 5, description: 'Number of rocks' },
      minSize: { type: 'number', min: 0.1, max: 2, default: 0.3, description: 'Minimum rock size' },
      maxSize: { type: 'number', min: 0.2, max: 5, default: 1.5, description: 'Maximum rock size' },
      spread: { type: 'number', min: 0.5, max: 10, default: 3, description: 'Cluster spread radius' },
      color: { type: 'color', default: '#808080', description: 'Rock base color' },
      roughness: { type: 'number', min: 0, max: 1, default: 0.8, description: 'Surface roughness' },
      mossAmount: { type: 'number', min: 0, max: 1, default: 0.2, description: 'Moss coverage' },
      mossColor: { type: 'color', default: '#3a5f0b', description: 'Moss color' }
    },
    textureSlots: [
      { id: 'rockTexture', label: 'Rock Texture', accept: 'image/png,image/jpeg', description: 'Custom rock surface texture' },
      { id: 'mossTexture', label: 'Moss Texture', accept: 'image/png', description: 'Custom moss texture (transparent PNG)' }
    ]
  },
  buildingModular: {
    name: 'Modular Building',
    description: 'Grammar-based modular building with style kits (office, warehouse, cottage, etc.)',
    params: {
      'footprint.shape': { type: 'select', options: ['rectangle', 'L', 'U'], default: 'rectangle', description: 'Building footprint shape' },
      'footprint.width': { type: 'number', min: 3, max: 30, default: 10, description: 'Building width (meters)' },
      'footprint.depth': { type: 'number', min: 3, max: 30, default: 8, description: 'Building depth (meters)' },
      floors: { type: 'number', step: 1, min: 1, max: 10, default: 2, description: 'Number of floors' },
      archetype: { type: 'select', options: ['custom', 'cottage', 'watchtower', 'ruin', 'timberHouse', 'smallShop'], default: 'custom', description: 'High-level building scaffold' },
      styleKit: { type: 'select', options: ['modern_glass', 'industrial_brick', 'medieval_timber', 'coastal_wood', 'fantasy_stone'], default: 'industrial_brick', description: 'Architectural style' },
      windowDensity: { type: 'select', options: ['sparse', 'normal', 'dense'], default: 'normal', description: 'Window frequency' },
      doorPlacement: { type: 'select', options: ['center', 'side', 'double'], default: 'center', description: 'Door position' },
      roofType: { type: 'select', options: ['flat', 'gable', 'hip', 'cone'], default: 'gable', description: 'Roof style' },
      hasChimney: { type: 'boolean', default: false, description: 'Add chimney' },
      hasFoundation: { type: 'boolean', default: true, description: 'Add foundation base' },
      hasCornice: { type: 'boolean', default: true, description: 'Add decorative cornice' },
      weathering: { type: 'number', min: 0, max: 1, default: 0, description: 'Weathering/aging amount' }
    },
    textureSlots: []
  },
  environmentScatter: {
    name: 'Environment Scatter',
    description: 'Natural prop placement using Poisson disc sampling (trees, rocks, grass)',
    params: {
      area: { type: 'number', min: 5, max: 100, default: 20, description: 'Scatter area size (meters)' },
      propType: { type: 'select', options: ['tree', 'rock', 'grass', 'bush', 'flower'], default: 'tree', description: 'Type of prop to scatter' },
      density: { type: 'number', min: 0.1, max: 1, default: 0.5, description: 'Prop density (0-1)' },
      minDistance: { type: 'number', min: 0.5, max: 10, default: 2, description: 'Minimum distance between props' },
      clearingRadius: { type: 'number', min: 0, max: 20, default: 0, description: 'Clear circle in center (0 = none)' },
      scaleVariation: { type: 'number', min: 0, max: 1, default: 0.3, description: 'Size variation amount' },
      colorVariation: { type: 'number', min: 0, max: 1, default: 0.1, description: 'Color variation amount' }
    },
    textureSlots: []
  }
}

/**
 * Get texture slots for a specific generator
 * @param {string} generatorName
 * @returns {Array}
 */
export function getTextureSlots(generatorName) {
  return generatorSchemas[generatorName]?.textureSlots || []
}

/**
 * Validate a spec against the schema
 * @param {Object} spec 
 * @returns {Object} Validated spec with defaults applied
 */
export function validateSpec(spec) {
  return assetSpecSchema.parse(spec)
}

/**
 * Get schema metadata for a specific generator
 * @param {string} generatorName 
 * @returns {Object|null}
 */
export function getGeneratorSchema(generatorName) {
  return generatorSchemas[generatorName] || null
}

/**
 * Get list of all generator names
 * @returns {string[]}
 */
export function getGeneratorNames() {
  return Object.keys(generatorSchemas)
}

const generatorAssetFamilies = {
  butterflySwarm: 'general',
  proceduralTree: 'treePlant',
  particleSystem: 'general',
  simpleBuilding: 'smallBuilding',
  rockCluster: 'rockCluster',
  buildingModular: 'smallBuilding',
  environmentScatter: 'groundCover'
}

export function inferAssetFamilyFromSpec(spec) {
  if (!spec?.generator) {
    return 'general'
  }

  if (spec.generator === 'environmentScatter') {
    if (spec.params?.propType === 'tree' || spec.params?.propType === 'bush') {
      return 'treePlant'
    }
    if (spec.params?.propType === 'rock') {
      return 'rockCluster'
    }
    return 'groundCover'
  }

  if (spec.generator === 'simpleBuilding' && spec.params?.style === 'tower') {
    return 'tower'
  }

  if (spec.generator === 'buildingModular' && spec.params?.archetype === 'watchtower') {
    return 'tower'
  }

  return generatorAssetFamilies[spec.generator] || 'general'
}
