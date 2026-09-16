export const BUILDING_ARCHETYPES = {
  cottage: {
    styleKit: 'coastal_wood',
    roofType: 'gable',
    floors: 1,
    windowDensity: 'normal',
    doorPlacement: 'center',
    hasChimney: true,
    hasFoundation: true,
    hasCornice: true,
    openingCadence: 'warm-regular',
    detailBudget: 'cozy-trim'
  },
  watchtower: {
    styleKit: 'fantasy_stone',
    roofType: 'cone',
    floors: 4,
    windowDensity: 'sparse',
    doorPlacement: 'center',
    hasChimney: false,
    hasFoundation: true,
    hasCornice: false,
    openingCadence: 'vertical-slit',
    detailBudget: 'defensive'
  },
  ruin: {
    styleKit: 'fantasy_stone',
    roofType: 'flat',
    floors: 2,
    windowDensity: 'sparse',
    doorPlacement: 'side',
    hasChimney: false,
    hasFoundation: true,
    hasCornice: false,
    openingCadence: 'broken-rhythm',
    detailBudget: 'weathered'
  },
  timberHouse: {
    styleKit: 'medieval_timber',
    roofType: 'gable',
    floors: 2,
    windowDensity: 'normal',
    doorPlacement: 'center',
    hasChimney: true,
    hasFoundation: true,
    hasCornice: true,
    openingCadence: 'timber-grid',
    detailBudget: 'ornamented'
  },
  smallShop: {
    styleKit: 'industrial_brick',
    roofType: 'flat',
    floors: 1,
    windowDensity: 'dense',
    doorPlacement: 'side',
    hasChimney: false,
    hasFoundation: true,
    hasCornice: true,
    openingCadence: 'storefront',
    detailBudget: 'signage-ready'
  }
}

function normalizeFootprint(archetype, footprint) {
  if (archetype === 'watchtower') {
    const size = Math.min(Math.max(footprint.width, 4), 8)
    return {
      shape: 'rectangle',
      width: size,
      depth: Math.min(Math.max(footprint.depth, 4), 8)
    }
  }

  if (archetype === 'smallShop') {
    return {
      shape: 'rectangle',
      width: Math.max(footprint.width, 8),
      depth: Math.max(footprint.depth, 5)
    }
  }

  return footprint
}

export function createArchetypePlan(input) {
  const {
    archetype = 'custom',
    footprint = { shape: 'rectangle', width: 10, depth: 8 },
    floors = 2,
    styleKit = 'industrial_brick',
    roofType = 'gable',
    windowDensity = 'normal',
    doorPlacement = 'center',
    hasChimney = false,
    hasFoundation = true,
    hasCornice = true,
    weathering = 0
  } = input

  const config = BUILDING_ARCHETYPES[archetype]
  if (!config) {
    return {
      archetype,
      footprint,
      floors,
      styleKit,
      roofType,
      windowDensity,
      doorPlacement,
      hasChimney,
      hasFoundation,
      hasCornice,
      weathering,
      openingCadence: 'balanced',
      detailBudget: 'custom'
    }
  }

  return {
    archetype,
    footprint: normalizeFootprint(archetype, footprint),
    floors: Math.max(floors, config.floors),
    styleKit: config.styleKit,
    roofType: config.roofType,
    windowDensity: config.windowDensity,
    doorPlacement: config.doorPlacement,
    hasChimney: config.hasChimney,
    hasFoundation: config.hasFoundation,
    hasCornice: config.hasCornice,
    weathering: archetype === 'ruin' ? Math.max(weathering, 0.65) : weathering,
    openingCadence: config.openingCadence,
    detailBudget: config.detailBudget
  }
}
