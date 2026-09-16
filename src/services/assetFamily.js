const FAMILY_CONFIG = {
  groundCover: {
    bucket: 'environment',
    priority: 1,
    baseWeight: 2,
    keywords: [
      'grass', 'meadow', 'flowers', 'flower', 'ground cover', 'groundcover',
      'fern', 'ferns', 'mushroom', 'mushrooms', 'wildflowers', 'clover', 'tuft', 'weeds'
    ]
  },
  treePlant: {
    bucket: 'environment',
    priority: 2,
    baseWeight: 2,
    keywords: [
      'tree', 'trees', 'pine', 'oak', 'birch', 'sapling', 'shrub', 'bush',
      'hedge', 'foliage', 'canopy', 'forest', 'bonsai'
    ]
  },
  rockCluster: {
    bucket: 'environment',
    priority: 1,
    baseWeight: 1,
    keywords: [
      'rock', 'rocks', 'stone', 'stones', 'boulder', 'boulders', 'cliff',
      'outcrop', 'rubble', 'crag', 'cairn'
    ]
  },
  smallBuilding: {
    bucket: 'architecture',
    priority: 4,
    baseWeight: 3,
    keywords: [
      'building', 'buildings', 'house', 'cottage', 'cabin', 'hut', 'shop',
      'storefront', 'barn', 'warehouse', 'inn', 'tavern', 'ruin', 'ruins'
    ]
  },
  tower: {
    bucket: 'architecture',
    priority: 5,
    baseWeight: 3,
    keywords: [
      'tower', 'watchtower', 'turret', 'spire', 'lighthouse', 'belfry', 'keep'
    ]
  },
  buildingDetail: {
    bucket: 'architecture',
    priority: 3,
    baseWeight: 3,
    keywords: [
      'door', 'doorway', 'window', 'arch', 'facade', 'façade', 'awning',
      'balcony', 'porch', 'chimney', 'sign', 'lantern', 'column', 'gate'
    ]
  }
}

export const CREATIVE_ASSET_FAMILIES = [
  ...Object.keys(FAMILY_CONFIG),
  'general'
]

function normalizePrompt(prompt = '') {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function countMatches(normalizedPrompt, keywords, weight = 1) {
  return keywords.reduce((score, keyword) => {
    if (!keyword) return score
    // Whole-word match with optional plural: bare substring matching made
    // 'cabinet' hit 'cabin' and 'dinner' hit 'inn', misrouting prompts into
    // the wrong family (wrong guidance + wrong critic rules).
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\b${escaped}s?\\b`)
    return pattern.test(normalizedPrompt) ? score + weight : score
  }, 0)
}

export function classifyAssetFamily(prompt = '') {
  const normalizedPrompt = normalizePrompt(prompt)
  if (!normalizedPrompt) {
    return 'general'
  }

  // Score the subject before accessory/depiction clauses. Do not fall back to
  // those clauses when the subject is unknown: a cabinet depicting a tree is
  // still a general prop, not vegetation. Keep this a conservative heuristic.
  const subject = normalizedPrompt.split(/\b(?:with|featuring|depicting|showing)\b/, 1)[0]

  let bestFamily = 'general'
  let bestScore = 0
  let bestPriority = 0

  for (const [family, config] of Object.entries(FAMILY_CONFIG)) {
    const score = countMatches(subject, config.keywords, config.baseWeight || 1)
    const priority = config.priority || 0
    if (score > bestScore || (score === bestScore && score > 0 && priority > bestPriority)) {
      bestFamily = family
      bestScore = score
      bestPriority = priority
    }
  }

  return bestScore > 0 ? bestFamily : 'general'
}

export function getAssetFamilyBucket(assetFamily = 'general') {
  return FAMILY_CONFIG[assetFamily]?.bucket || 'general'
}

export function isStructuredCreativeFamily(assetFamily = 'general') {
  return assetFamily !== 'general'
}

export function getAssetFamilyLabel(assetFamily = 'general') {
  return assetFamily
}

export function getFamilyKeywords(assetFamily = 'general') {
  return FAMILY_CONFIG[assetFamily]?.keywords || []
}
