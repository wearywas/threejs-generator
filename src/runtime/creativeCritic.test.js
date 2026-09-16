import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { evaluateCreativeAsset } from './creativeCritic'

describe('evaluateCreativeAsset', () => {
  it('accepts a grounded tree asset with coherent trunk, branches, and canopy', () => {
    const root = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.2, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x775533 }))
    trunk.position.y = 0.5
    root.add(trunk)

    for (let i = 0; i < 3; i++) {
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.07, 0.9, 5),
        new THREE.MeshStandardMaterial({ color: 0x664422 })
      )
      branch.geometry.translate(0, 0.45, 0)
      branch.position.set(0, 1.1 + i * 0.25, 0)
      branch.rotation.set(0.3, i * ((Math.PI * 2) / 3), -0.8)
      trunk.add(branch)

      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x226633 })
      )
      canopy.position.set(
        Math.cos(i * ((Math.PI * 2) / 3)) * 0.42,
        1.45 + i * 0.18,
        Math.sin(i * ((Math.PI * 2) / 3)) * 0.42
      )
      root.add(canopy)
    }

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 480, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant'
    })

    expect(evaluation.accepted).toBe(true)
    expect(evaluation.metrics.materialCount).toBeGreaterThanOrEqual(2)
  })

  it('rejects sphere-blob trees with no readable trunk support', () => {
    const root = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x775533 }))
    trunk.position.y = 0.35
    root.add(trunk)

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0x226633 }))
    canopy.position.y = 1.7
    root.add(canopy)

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 900, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant'
    })

    expect(evaluation.accepted).toBe(false)
    expect(evaluation.reasons.join(' ')).toMatch(/trunk|canopy|sphere|support/i)
  })

  it('rejects detached floating canopy masses for tree assets', () => {
    const root = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0x775533 }))
    trunk.position.y = 0.9
    root.add(trunk)

    for (let i = 0; i < 3; i++) {
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x226633 })
      )
      canopy.position.set(1.6 + i * 0.45, 2.8, 0)
      root.add(canopy)
    }

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 720, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant'
    })

    expect(evaluation.accepted).toBe(false)
    expect(evaluation.reasons.join(' ')).toMatch(/floating|detached|canopy/i)
  })

  it('rejects stacked uniform conifer tiers with no visible branch support', () => {
    const root = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x5f4228 }))
    trunk.position.y = 1.2
    root.add(trunk)

    for (let i = 0; i < 4; i++) {
      const tier = new THREE.Mesh(
        new THREE.ConeGeometry(1.1 - i * 0.15, 0.35, 8),
        new THREE.MeshStandardMaterial({ color: 0x225f2b })
      )
      tier.position.y = 1.2 + i * 0.38
      root.add(tier)
    }

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 960, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant'
    })

    expect(evaluation.accepted).toBe(false)
    expect(evaluation.reasons.join(' ')).toMatch(/stacked|tier|branch support|taper/i)
  })

  it('accepts pines with a leader, irregular whorls, and supported foliage pads', () => {
    const root = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x5f4228 }))
    trunk.position.y = 1.6
    root.add(trunk)

    const leader = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.05, 0.9, 5),
      new THREE.MeshStandardMaterial({ color: 0x5f4228 })
    )
    leader.position.y = 3.65
    root.add(leader)

    ;[
      { y: 1.55, radius: 0.9, branchLength: 0.8 },
      { y: 2.05, radius: 0.72, branchLength: 0.66 },
      { y: 2.78, radius: 0.5, branchLength: 0.5 }
    ].forEach((whorl, index) => {
      for (let branchIndex = 0; branchIndex < 3; branchIndex++) {
        const angle = branchIndex * ((Math.PI * 2) / 3) + index * 0.2
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.04, whorl.branchLength, 5),
          new THREE.MeshStandardMaterial({ color: 0x69492d })
        )
        branch.geometry.translate(0, whorl.branchLength / 2, 0)
        branch.position.set(0, whorl.y - trunk.position.y, 0)
        branch.rotation.set(0.15, angle, -1 + index * 0.08)
        trunk.add(branch)

        const pad = new THREE.Mesh(
          new THREE.ConeGeometry(whorl.radius * 0.45, 0.45, 6),
          new THREE.MeshStandardMaterial({ color: 0x2a6a31 })
        )
        pad.position.set(
          Math.cos(angle) * whorl.radius,
          whorl.y + 0.1,
          Math.sin(angle) * whorl.radius
        )
        root.add(pad)
      }
    })

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 1400, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant'
    })

    expect(evaluation.accepted).toBe(true)
  })

  it('rejects compact center-clumped conifers with weak lower-bough spread', () => {
    const root = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 3, 6), new THREE.MeshStandardMaterial({ color: 0x5f4228 }))
    trunk.position.y = 1.5
    root.add(trunk)

    const leader = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.04, 0.7, 5),
      new THREE.MeshStandardMaterial({ color: 0x5f4228 })
    )
    leader.position.y = 3.35
    root.add(leader)

    ;[
      { y: 1.6, radius: 0.18 },
      { y: 2.02, radius: 0.2 },
      { y: 2.45, radius: 0.16 },
      { y: 2.82, radius: 0.14 }
    ].forEach((whorl, index) => {
      for (let branchIndex = 0; branchIndex < 3; branchIndex++) {
        const angle = branchIndex * ((Math.PI * 2) / 3)
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.03, 0.24, 5),
          new THREE.MeshStandardMaterial({ color: 0x69492d })
        )
        branch.geometry.translate(0, 0.12, 0)
        branch.position.set(0, whorl.y - trunk.position.y, 0)
        branch.rotation.set(0.08, angle, -1.02 + index * 0.04)
        trunk.add(branch)

        const pad = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.28, 6),
          new THREE.MeshStandardMaterial({ color: 0x2a6a31 })
        )
        pad.position.set(
          Math.cos(angle) * whorl.radius,
          whorl.y + 0.06,
          Math.sin(angle) * whorl.radius
        )
        root.add(pad)
      }
    })

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 1200, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant'
    })

    expect(evaluation.accepted).toBe(false)
    expect(evaluation.reasons.join(' ')).toMatch(/lower bough|clump|taper|center/i)
  })

  it('accepts a broadleaf oak with a domed, centered crown (no conifer rules)', () => {
    const root = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0x5a4632 }))
    trunk.position.y = 2.1
    root.add(trunk)

    const lobePositions = [
      [0, 5.2, 0], [1.6, 4.8, 1.0], [-1.5, 5.0, 1.2], [1.2, 5.4, -1.4],
      [-1.7, 4.6, -1.0], [2.0, 4.9, -0.4], [-0.6, 5.6, 0.6], [0.8, 4.4, 1.8]
    ]
    lobePositions.forEach(([x, y, z], index) => {
      const lobe = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.0 + (index % 3) * 0.1, 1),
        new THREE.MeshStandardMaterial({ color: 0x3f6b2a })
      )
      lobe.position.set(x, y, z)
      root.add(lobe)
    })

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 1500, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant',
      prompt: 'A gnarled ancient oak tree'
    })

    expect(evaluation.accepted).toBe(true)
  })

  it('accepts a gnarled tree with a segmented trunk and branch-anchored far lobes', () => {
    const root = new THREE.Group()
    const bark = new THREE.MeshStandardMaterial({ color: 0x5a4632 })

    // Curved trunk built from stacked short segments (no single tall mesh)
    const segmentOffsets = [0, 0.12, 0.26, 0.18, 0.05]
    segmentOffsets.forEach((xOffset, index) => {
      const segment = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.75, 7), bark)
      segment.position.set(xOffset, 0.35 + index * 0.66, 0)
      root.add(segment)
    })

    // Long horizontal branches reaching away from the trunk axis
    const branchA = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.28, 0.3), bark)
    branchA.position.set(1.6, 3.3, 0)
    root.add(branchA)
    const branchB = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.26, 0.3), bark)
    branchB.position.set(-1.4, 3.0, 0.4)
    root.add(branchB)

    // Canopy lobes at the branch ends, beyond direct trunk reach
    const foliage = new THREE.MeshStandardMaterial({ color: 0x35592a })
    const lobeA = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), foliage)
    lobeA.position.set(3.0, 3.8, 0)
    root.add(lobeA)
    const lobeB = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), foliage)
    lobeB.position.set(-2.6, 3.6, 0.4)
    root.add(lobeB)
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), foliage)
    crown.position.set(0.1, 4.3, 0)
    root.add(crown)

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 1200, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant',
      prompt: 'A gnarled ancient oak tree'
    })

    expect(evaluation.accepted).toBe(true)
  })

  it('measures instanced canopies at their real instance placements', () => {
    const root = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.0, 8), new THREE.MeshStandardMaterial({ color: 0x5a4632 }))
    trunk.position.y = 1.5
    root.add(trunk)

    const canopy = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.95, 1),
      new THREE.MeshStandardMaterial({ color: 0x3f6b2a }),
      7
    )
    const placements = [
      [0.7, 3.1, 0.2], [-0.6, 3.3, 0.5], [0.2, 3.6, -0.7], [-0.3, 2.9, -0.4],
      [0.6, 3.5, -0.5], [-0.7, 3.0, -0.2], [0, 3.9, 0.3]
    ]
    placements.forEach(([x, y, z], index) => {
      canopy.setMatrixAt(index, new THREE.Matrix4().setPosition(x, y, z))
    })
    root.add(canopy)

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 1100, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'treePlant',
      prompt: 'A leafy tree'
    })

    expect(evaluation.accepted).toBe(true)
  })

  it('rejects fragmented floating architecture assets', () => {
    const root = new THREE.Group()

    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.2),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${i * 25}, 50%, 50%)`) })
      )
      mesh.position.set(i * 1.1, 2 + i * 0.2, 0)
      root.add(mesh)
    }

    const evaluation = evaluateCreativeAsset({
      asset: { root, triangleCount: 2400, usedAddons: [] },
      code: 'function createAsset() {}',
      assetFamily: 'smallBuilding'
    })

    expect(evaluation.accepted).toBe(false)
    expect(evaluation.reasons.join(' ')).toMatch(/ground|fragment/i)
  })
})
