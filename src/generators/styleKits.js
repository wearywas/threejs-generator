/**
 * Style Kits for Building Grammar System
 * Each kit defines modules, rules, materials, and palette for a building style
 */

export const STYLE_KITS = {
  modern_glass: {
    name: 'Modern Glass',
    description: 'Contemporary glass and concrete office buildings',
    rules: {
      floorHeight: 3.2,
      bayWidth: 2.4,
      roofPitch: 0,
      windowRatio: 0.7,      // High window coverage
      sillHeight: 0.8,       // Height from floor to window bottom
      headerHeight: 0.3,     // Height from window top to ceiling
      doorWidth: 1.6,
      doorHeight: 2.4,
      trimThickness: 0.05
    },
    modules: {
      window: 'curtainWall',
      door: 'glassDouble',
      wall: 'concretePanel',
      roof: 'flatParapet'
    },
    materials: {
      wall: { color: '#E0E0E0', roughness: 0.7, metalness: 0.0 },
      trim: { color: '#404040', roughness: 0.4, metalness: 0.3 },
      glass: { color: '#88CCFF', opacity: 0.3, roughness: 0.05, metalness: 0.1 },
      roof: { color: '#505050', roughness: 0.8, metalness: 0.0 }
    },
    palette: ['#E0E0E0', '#303030', '#B0C4DE'],
    textures: {
      wall: 'concrete',
      trim: null,
      roof: null
    }
  },

  industrial_brick: {
    name: 'Industrial Brick',
    description: 'Brick warehouses and factory buildings',
    rules: {
      floorHeight: 3.5,
      bayWidth: 2.0,
      roofPitch: 0,
      windowRatio: 0.4,      // Medium window coverage
      sillHeight: 1.0,
      headerHeight: 0.4,
      doorWidth: 2.0,        // Wider industrial doors
      doorHeight: 2.8,
      trimThickness: 0.08
    },
    modules: {
      window: 'gridWindow',
      door: 'industrialDouble',
      wall: 'brickWall',
      roof: 'flatParapet'
    },
    materials: {
      wall: { color: '#8B4513', roughness: 0.9, metalness: 0.0 },
      trim: { color: '#404040', roughness: 0.5, metalness: 0.4 },
      glass: { color: '#87CEEB', opacity: 0.4, roughness: 0.1, metalness: 0.0 },
      roof: { color: '#404040', roughness: 0.8, metalness: 0.0 }
    },
    palette: ['#8B4513', '#404040', '#606060'],
    textures: {
      wall: 'brick',
      trim: null,
      roof: null
    }
  },

  medieval_timber: {
    name: 'Medieval Timber',
    description: 'Half-timbered cottages and taverns',
    rules: {
      floorHeight: 2.8,
      bayWidth: 1.2,
      roofPitch: 45,
      windowRatio: 0.25,     // Small windows
      sillHeight: 1.0,
      headerHeight: 0.3,
      doorWidth: 1.0,
      doorHeight: 2.0,
      trimThickness: 0.1
    },
    modules: {
      window: 'casement',
      door: 'arched',
      wall: 'timberFrame',
      roof: 'gabledThatch'
    },
    materials: {
      wall: { color: '#F5DEB3', roughness: 0.95, metalness: 0.0 },      // Plaster
      trim: { color: '#5D4037', roughness: 0.8, metalness: 0.0 },       // Dark wood
      glass: { color: '#D4AF37', opacity: 0.6, roughness: 0.3, metalness: 0.0 }, // Old glass
      roof: { color: '#8B7355', roughness: 1.0, metalness: 0.0 }        // Thatch
    },
    palette: ['#8B4513', '#F5DEB3', '#2F4F4F'],
    textures: {
      wall: null,
      trim: 'woodGrain',
      roof: null
    }
  },

  coastal_wood: {
    name: 'Coastal Wood',
    description: 'Beach houses and seaside cottages',
    rules: {
      floorHeight: 2.8,
      bayWidth: 1.5,
      roofPitch: 30,
      windowRatio: 0.35,
      sillHeight: 0.9,
      headerHeight: 0.3,
      doorWidth: 0.9,
      doorHeight: 2.1,
      trimThickness: 0.06
    },
    modules: {
      window: 'shuttered',
      door: 'paneled',
      wall: 'clapboard',
      roof: 'gabledShingle'
    },
    materials: {
      wall: { color: '#E8E8E8', roughness: 0.8, metalness: 0.0 },      // White paint
      trim: { color: '#1E3A5F', roughness: 0.7, metalness: 0.0 },       // Navy blue
      glass: { color: '#87CEEB', opacity: 0.3, roughness: 0.1, metalness: 0.0 },
      roof: { color: '#2F4F4F', roughness: 0.9, metalness: 0.0 }        // Dark shingle
    },
    palette: ['#E8E8E8', '#1E3A5F', '#2F4F4F'],
    textures: {
      wall: 'woodSiding',
      trim: null,
      roof: null
    }
  },

  fantasy_stone: {
    name: 'Fantasy Stone',
    description: 'Castles, towers, and mystical structures',
    rules: {
      floorHeight: 3.5,
      bayWidth: 1.8,
      roofPitch: 50,
      windowRatio: 0.2,      // Small slit windows
      sillHeight: 1.2,
      headerHeight: 0.4,
      doorWidth: 1.4,
      doorHeight: 2.5,
      trimThickness: 0.12
    },
    modules: {
      window: 'archSlot',
      door: 'archedHeavy',
      wall: 'stoneMasonry',
      roof: 'conical'
    },
    materials: {
      wall: { color: '#808080', roughness: 0.95, metalness: 0.0 },     // Gray stone
      trim: { color: '#505050', roughness: 0.9, metalness: 0.0 },       // Darker stone
      glass: { color: '#4169E1', opacity: 0.5, roughness: 0.2, metalness: 0.0 }, // Stained glass
      roof: { color: '#2F4F4F', roughness: 0.85, metalness: 0.0 }       // Slate
    },
    palette: ['#808080', '#505050', '#2F4F4F'],
    textures: {
      wall: 'speckle',
      trim: null,
      roof: null
    }
  }
}

/**
 * Get a style kit by name
 * @param {string} name - Kit name
 * @returns {Object|null}
 */
export function getStyleKit(name) {
  return STYLE_KITS[name] || null
}

/**
 * Get all style kit names
 * @returns {string[]}
 */
export function getStyleKitNames() {
  return Object.keys(STYLE_KITS)
}

/**
 * Get kit description for display
 * @param {string} name
 * @returns {string}
 */
export function getKitDescription(name) {
  return STYLE_KITS[name]?.description || ''
}
