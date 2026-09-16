import { createAssetDocument } from './assetDocument'

function template(id, name, description, generator, seed, params) {
  return Object.freeze({
    id, name, description,
    thumbnail: `/templates/${id}.png`,
    document: createAssetDocument({ mode: 'curated', prompt: name, seed, spec: { generator, params }, textures: {} }),
  })
}

/** Shipped starting points, separate from the user's IndexedDB library. */
export const builtinTemplates = Object.freeze([
  template('butterfly-swarm', 'Butterfly Swarm', 'Colorful butterflies with animated wings and looping flight.', 'butterflySwarm', 2101,
    { count: 7, flightRadius: 1.35, wingSpan: 0.65, heightVariation: 0.7, colors: ['#e6b865', '#78aaa6', '#d98b79'] }),
  template('broadleaf-tree', 'Broadleaf Tree', 'A leafy green tree with a branching trunk and gentle wind sway.', 'proceduralTree', 2102,
    { height: 5, foliageType: 'broadleaf', leafCount: 240, trunkColor: '#68513e', foliageColor: '#557747', swayAmount: 0.07 }),
  template('firefly-particles', 'Firefly Particles', 'A floating cloud of warm golden fireflies.', 'particleSystem', 2103,
    { type: 'fireflies', count: 70, area: 3.5, size: 0.09, color: '#ffe891' }),
  template('country-cottage', 'Country Cottage', 'A compact cottage with a gabled roof, chimney, door, and windows.', 'simpleBuilding', 2104,
    { style: 'cottage', width: 4, depth: 3, height: 2.7, roofType: 'gabled', wallColor: '#d0c3a1', roofColor: '#526366' }),
  template('mossy-rocks', 'Mossy Rocks', 'A small cluster of rough gray rocks with patches of moss.', 'rockCluster', 2105,
    { count: 5, minSize: 0.4, maxSize: 1.15, spread: 3.8, mossAmount: 0.62, color: '#737c79', mossColor: '#657747' }),
  template('timber-house', 'Timber House', 'A two-story modular timber house on a rectangular foundation.', 'buildingModular', 2106,
    { footprint: { shape: 'rectangle', width: 8, depth: 6 }, floors: 2, archetype: 'custom', styleKit: 'medieval_timber', roofType: 'gable', hasChimney: true }),
  template('woodland-scatter', 'Woodland Scatter', 'A naturally spaced grove of trees with varied sizes and colors.', 'environmentScatter', 2107,
    { area: 12, propType: 'tree', density: 0.65, minDistance: 2.3, scaleVariation: 0.25, colorVariation: 0.2 }),
])
