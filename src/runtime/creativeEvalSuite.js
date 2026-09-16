const SUITE = {
  environment: {
    groundCover: [
      'a patch of wind-swept meadow grass',
      'a low clump of forest ferns',
      'a flower patch with pink blossoms',
      'a mossy roadside weed cluster',
      'a dense tuft of wildflowers'
    ],
    treeAndRock: [
      'a windswept pine tree',
      'a broadleaf sapling with dense canopy',
      'a mossy rock cluster',
      'a shrub with layered foliage',
      'a dead tree stump ringed by stones'
    ]
  },
  architecture: {
    smallStructures: [
      'a cozy coastal cottage',
      'a fantasy watchtower',
      'a weathered timber house',
      'a small brick shopfront',
      'a broken stone ruin'
    ]
  },
  stress: [
    'a watchtower with layered roof details and narrow slit windows',
    'a clustered pine grove with rocks and shrubs',
    'a flower patch wrapped around a ruined doorway'
  ]
}

export function getCreativeEvaluationSuite() {
  return SUITE
}
