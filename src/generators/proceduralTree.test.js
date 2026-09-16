import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { createProceduralTree } from './proceduralTree'

function countNamedChildren(root, prefix) {
  let count = 0
  root.traverse(child => {
    if (typeof child.name === 'string' && child.name.startsWith(prefix)) {
      count += 1
    }
  })
  return count
}

function collectNamedChildren(root, prefix) {
  const matches = []
  root.traverse(child => {
    if (typeof child.name === 'string' && child.name.startsWith(prefix)) {
      matches.push(child)
    }
  })
  return matches
}

function horizontalRadius(object) {
  return Math.hypot(object.position.x, object.position.z)
}

// Test the closed, convex triangle surface, not a hand-estimated canopy radius.
function insideMesh(mesh, worldPoint) {
  const point = mesh.worldToLocal(worldPoint.clone())
  const positions = mesh.geometry.attributes.position
  const indices = mesh.geometry.index
  const count = indices ? indices.count : positions.count
  for (let i = 0; i < count; i += 3) {
    const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(
      positions, indices ? indices.getX(i + offset) : i + offset
    ))
    const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize()
    if (normal.dot(point.clone().sub(vertices[0])) > 1e-5) return false
  }
  return true
}

function branchEnd(branch, top) {
  branch.geometry.computeBoundingBox()
  const box = branch.geometry.boundingBox
  return branch.localToWorld(new THREE.Vector3(0, top ? box.max.y : box.min.y, 0))
}

function geometrySignature(asset) {
  asset.root.updateMatrixWorld(true)
  const result = []
  asset.root.traverse(mesh => {
    if (mesh.isMesh) result.push([
      mesh.name, mesh.matrixWorld.toArray(), Array.from(mesh.geometry.attributes.position.array),
      mesh.material.color.getHex()
    ])
  })
  return JSON.stringify(result)
}

describe('broadleaf geometry', () => {
  it.each([2102, 7, 42])('buries real branch tips and trunk top in foliage, including wind (seed %s)', seed => {
    const asset = createProceduralTree({ height: 5, leafCount: 180, swayAmount: 0.3 }, seed)
    const lobes = collectNamedChildren(asset.root, 'canopy_lobe_')
    const branches = collectNamedChildren(asset.root, 'branch_segment_')
    const trunk = asset.root.getObjectByName('trunk')
    asset.root.position.set(2, -1, 4)
    asset.root.scale.setScalar(1.3)
    asset.root.updateMatrixWorld(true)
    const originalBases = branches.map(branch => trunk.worldToLocal(branchEnd(branch, false)))
    for (const time of [0, 1.25, 5, 20]) {
      asset.tick(time)
      asset.root.updateMatrixWorld(true)
      for (const branch of branches) {
        expect(lobes.some(lobe => insideMesh(lobe, branchEnd(branch, true)))).toBe(true)
        expect(insideMesh(trunk, branchEnd(branch, false))).toBe(true)
        const trunkLocalBase = trunk.worldToLocal(branchEnd(branch, false))
        expect(trunkLocalBase.distanceTo(originalBases[branches.indexOf(branch)])).toBeLessThan(1e-6)
        // The whole end cap, not only its center, must disappear into leaves.
        const positions = branch.geometry.attributes.position
        for (let i = 0; i < positions.count; i++) {
          if (Math.abs(positions.getY(i) - branch.geometry.boundingBox.max.y) > 1e-5) continue
          const vertex = branch.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i))
          expect(lobes.some(lobe => insideMesh(lobe, vertex))).toBe(true)
        }
      }
      expect(lobes.some(lobe => insideMesh(lobe, branchEnd(trunk, true)))).toBe(true)
    }
    asset.dispose()
  })

  it('forms one overlapping crown with a full layered silhouette at catalog settings', () => {
    const asset = createProceduralTree({ height: 5, leafCount: 180, windSway: false }, 2102)
    asset.root.updateMatrixWorld(true)
    const lobes = collectNamedChildren(asset.root, 'canopy_lobe_')
    const connected = new Set([lobes[0]])
    for (let pass = 0; pass < lobes.length; pass++) {
      for (const a of connected) for (const b of lobes) {
        const start = a.getWorldPosition(new THREE.Vector3())
        const end = b.getWorldPosition(new THREE.Vector3())
        if ([0.25, 0.5, 0.75].some(t => {
          const point = start.clone().lerp(end, t)
          return insideMesh(a, point) && insideMesh(b, point)
        })) connected.add(b)
      }
    }
    expect(connected.size).toBe(lobes.length)
    const bounds = new THREE.Box3()
    lobes.forEach(lobe => bounds.union(new THREE.Box3().setFromObject(lobe)))
    expect(bounds.max.y).toBeGreaterThan(4.5)
    expect(bounds.max.y).toBeLessThan(5.6)
    expect(bounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(3)
    asset.dispose()
  })

  it('is deterministic but responds to seed, size, density and supplied color', () => {
    const params = { height: 5, leafCount: 180, windSway: false }
    const assets = [
      createProceduralTree(params, 2102), createProceduralTree(params, 2102),
      createProceduralTree(params, 2103), createProceduralTree({ ...params, height: 7 }, 2102),
      createProceduralTree({ ...params, leafCount: 320 }, 2102),
      createProceduralTree({ ...params, foliageColor: '#873fa2' }, 2102)
    ]
    const signatures = assets.map(geometrySignature)
    expect(signatures[0]).toBe(signatures[1])
    signatures.slice(2).forEach(signature => expect(signature).not.toBe(signatures[0]))
    assets.forEach(asset => asset.dispose())
  })

  it('scales the visible tree with height and trunk thickness', () => {
    const small = createProceduralTree({ height: 3, trunkRadius: 0.2, windSway: false }, 2102)
    const tall = createProceduralTree({ height: 6, trunkRadius: 0.4, windSway: false }, 2102)
    const smallSize = new THREE.Box3().setFromObject(small.root).getSize(new THREE.Vector3())
    const tallSize = new THREE.Box3().setFromObject(tall.root).getSize(new THREE.Vector3())
    expect(tallSize.x / smallSize.x).toBeCloseTo(2)
    expect(tallSize.y / smallSize.y).toBeCloseTo(2)
    expect(tallSize.z / smallSize.z).toBeCloseTo(2)
    small.dispose()
    tall.dispose()
  })

  it.each([20, 180, 500])('keeps foliage closed, geometry finite and triangle cost bounded at %s leaves', leafCount => {
    const asset = createProceduralTree({ leafCount }, 2102)
    let triangles = 0
    asset.root.traverse(mesh => {
      if (!mesh.isMesh) return
      const geometry = mesh.geometry
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3
      for (const attribute of Object.values(geometry.attributes)) {
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true)
      }
      if (!mesh.name.startsWith('canopy_lobe_')) return
      const positions = geometry.attributes.position
      const indices = geometry.index
      const edges = new Map()
      for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
        const keys = [0, 1, 2].map(offset => {
          const vertex = new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + offset) : i + offset)
          return vertex.toArray().map(value => Number(value.toFixed(5))).join(',')
        })
        if (new Set(keys).size < 3) continue
        for (let j = 0; j < 3; j++) {
          const edge = [keys[j], keys[(j + 1) % 3]].sort().join('|')
          edges.set(edge, (edges.get(edge) || 0) + 1)
        }
      }
      expect([...edges.values()].every(count => count === 2)).toBe(true)
    })
    expect(triangles).toBeLessThan(10000)
    asset.dispose()
  })

  it('disposes every owned geometry and shared material exactly once', () => {
    const asset = createProceduralTree({}, 2102)
    const events = new Map()
    asset.root.traverse(mesh => {
      if (!mesh.isMesh) return
      for (const resource of [mesh.geometry, mesh.material]) {
        if (events.has(resource)) continue
        events.set(resource, 0)
        resource.addEventListener('dispose', () => events.set(resource, events.get(resource) + 1))
      }
    })
    asset.dispose()
    expect([...events.values()].every(count => count === 1)).toBe(true)
  })
})

describe('createProceduralTree', () => {
  it('defaults to a broadleaf hierarchy with branch-supported canopy masses', () => {
    const asset = createProceduralTree({ windSway: false }, 42)

    expect(countNamedChildren(asset.root, 'branch_segment_')).toBeGreaterThan(0)
    expect(countNamedChildren(asset.root, 'canopy_lobe_')).toBeGreaterThanOrEqual(2)
    expect(countNamedChildren(asset.root, 'surface_root_')).toBeGreaterThan(0)
    expect(asset.root.getObjectByName('base_flare')).toBeTruthy()
  })

  it('uses leaf count to increase structural canopy detail', () => {
    const sparse = createProceduralTree({ foliageType: 'broadleaf', leafCount: 60, windSway: false }, 7)
    const dense = createProceduralTree({ foliageType: 'broadleaf', leafCount: 320, windSway: false }, 7)

    expect(countNamedChildren(dense.root, 'branch_segment_')).toBeGreaterThan(countNamedChildren(sparse.root, 'branch_segment_'))
    expect(countNamedChildren(dense.root, 'canopy_lobe_')).toBeGreaterThan(countNamedChildren(sparse.root, 'canopy_lobe_'))
  })

  it('builds pine trees around a leader, branch whorls, and supported needle pads', () => {
    const asset = createProceduralTree({ foliageType: 'cone', leafCount: 220, windSway: false }, 19)

    expect(asset.root.getObjectByName('leader_tip')).toBeTruthy()
    expect(countNamedChildren(asset.root, 'pine_whorl_')).toBeGreaterThanOrEqual(3)
    expect(countNamedChildren(asset.root, 'pine_branch_')).toBeGreaterThan(0)
    expect(countNamedChildren(asset.root, 'needle_pad_')).toBeGreaterThan(0)
  })

  it('creates irregular whorl spacing for pine silhouettes', () => {
    const asset = createProceduralTree({ foliageType: 'cone', leafCount: 200, windSway: false }, 33)
    const whorls = collectNamedChildren(asset.root, 'pine_whorl_')
      .map(mesh => Number(mesh.position.y.toFixed(3)))
      .sort((a, b) => a - b)

    const gaps = whorls.slice(1).map((y, index) => Number((y - whorls[index]).toFixed(3)))
    const uniqueGaps = new Set(gaps)

    expect(whorls.length).toBeGreaterThanOrEqual(3)
    expect(uniqueGaps.size).toBeGreaterThan(1)
  })

  it('creates a wider lower pine crown than upper crown', () => {
    const asset = createProceduralTree({ foliageType: 'cone', leafCount: 220, windSway: false }, 19)
    const pads = collectNamedChildren(asset.root, 'needle_pad_')
    const midY = Math.max(...pads.map(pad => pad.parent.parent.position.y)) * 0.72
    const lowerPads = pads.filter(pad => pad.parent.parent.position.y <= midY)
    const upperPads = pads.filter(pad => pad.parent.parent.position.y > midY)

    const lowerRadius = Math.max(...lowerPads.map(horizontalRadius))
    const upperRadius = Math.max(...upperPads.map(horizontalRadius))

    expect(lowerRadius).toBeGreaterThan(upperRadius * 1.45)
  })

  it('animates pine sway at the crown level without changing branch local rotations independently', () => {
    const asset = createProceduralTree({ foliageType: 'cone', leafCount: 220, windSway: true, swayAmount: 0.12 }, 19)
    const crownGroup = asset.root.getObjectByName('crown_group')
    const branch = collectNamedChildren(asset.root, 'pine_branch_')[0]
    const initialBranchRotation = branch.rotation.clone()

    asset.tick?.(1.25)

    expect(crownGroup.rotation.x).not.toBe(0)
    expect(crownGroup.rotation.z).not.toBe(0)
    expect(branch.rotation.x).toBeCloseTo(initialBranchRotation.x)
    expect(branch.rotation.y).toBeCloseTo(initialBranchRotation.y)
    expect(branch.rotation.z).toBeCloseTo(initialBranchRotation.z)
  })
})
