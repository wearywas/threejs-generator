import { describe, expect, it } from 'vitest'

import { createEnvironmentKitLibrary } from './environmentKits'

describe('createEnvironmentKitLibrary', () => {
  it('exposes reusable environment primitives for scatter generators', () => {
    const kits = createEnvironmentKitLibrary()

    expect(Object.keys(kits)).toEqual(
      expect.arrayContaining([
        'grassClump',
        'flowerPatch',
        'rockMound',
        'pineTrunk',
        'pineFoliageCluster',
        'leaderTip',
        'branchWhorl',
        'needlePadPrimary',
        'needlePadSecondary',
        'droopingLowerBranch',
        'broadleafCanopyPrimary',
        'broadleafCanopySecondary',
        'branchSegment',
        'baseFlare',
        'surfaceRoot',
        'deadBranch',
        'shrubMass'
      ])
    )
  })
})
