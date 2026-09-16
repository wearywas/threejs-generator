import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createRockCluster } from './rockCluster'

const stones = root => {
  const result = []
  root.traverse(object => { if (object.geometry?.type === 'IcosahedronGeometry') result.push(object) })
  return result
}

function edgeCounts(geometry) {
  const positions = geometry.attributes.position
  const index = geometry.index
  const key = i => [positions.getX(i), positions.getY(i), positions.getZ(i)].map(n => Math.round(n * 1e6)).join(',')
  const edges = new Map()
  for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
    const triangle = [0, 1, 2].map(j => key(index ? index.getX(i + j) : i + j))
    for (let j = 0; j < 3; j++) {
      const edge = [triangle[j], triangle[(j + 1) % 3]].sort().join('|')
      edges.set(edge, (edges.get(edge) || 0) + 1)
    }
  }
  return [...edges.values()]
}

describe('rock cluster geometry', () => {
  it.each([0, 42, 2105, 9999])('keeps deformed rock and pebble surfaces closed for seed %s', seed => {
    const asset = createRockCluster({ count: 4, mossAmount: 0 }, seed)
    try {
      for (const stone of stones(asset.root)) {
        expect(edgeCounts(stone.geometry).every(count => count === 2)).toBe(true)
        expect(Array.from(stone.geometry.attributes.position.array).every(Number.isFinite)).toBe(true)
      }
    } finally { asset.dispose() }
  })

  it('grounds each rotated stone at the floor instead of using its unrotated bounds', () => {
    const asset = createRockCluster({ count: 5, mossAmount: 0 }, 2105)
    try {
      asset.root.updateMatrixWorld(true)
      for (const stone of stones(asset.root)) {
        const positions = stone.geometry.attributes.position
        let bottom = Infinity
        for (let i = 0; i < positions.count; i++) {
          bottom = Math.min(bottom, new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(stone.matrixWorld).y)
        }
        expect(bottom).toBeCloseTo(0, 5)
      }
    } finally { asset.dispose() }
  })

  it('places moss directly on stone faces instead of floating discs', () => {
    const asset = createRockCluster({ count: 3, mossAmount: 1 }, 2105)
    try {
      asset.root.updateMatrixWorld(true)
      const rockVertices = stones(asset.root).flatMap(stone => {
        const positions = stone.geometry.attributes.position
        return Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(stone.matrixWorld))
      })
      const moss = []
      asset.root.traverse(object => { if (object.isMesh && object.geometry.type !== 'IcosahedronGeometry') moss.push(object) })
      expect(moss.length).toBeGreaterThan(0)
      for (const patch of moss) {
        const positions = patch.geometry.attributes.position
        for (let i = 0; i < positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(patch.matrixWorld)
          expect(Math.min(...rockVertices.map(vertex => vertex.distanceTo(point)))).toBeLessThan(0.02)
        }
      }
    } finally { asset.dispose() }
  })

  it('changing moss coverage leaves the underlying seeded stones unchanged', () => {
    const bare = createRockCluster({ count: 4, mossAmount: 0 }, 2105)
    const mossy = createRockCluster({ count: 4, mossAmount: 0.8 }, 2105)
    const snapshot = root => stones(root).map(stone => ({
      vertices: Array.from(stone.geometry.attributes.position.array),
      position: stone.position.toArray(), rotation: stone.quaternion.toArray(),
    }))
    try { expect(snapshot(mossy.root)).toEqual(snapshot(bare.root)) }
    finally { bare.dispose(); mossy.dispose() }
  })

  it('releases every stone and moss resource exactly once', () => {
    const asset = createRockCluster({ count: 3, mossAmount: 1 }, 2105)
    const events = new Map()
    asset.root.traverse(object => {
      for (const resource of [object.geometry, ...[object.material].flat()].filter(Boolean)) events.set(resource, 0)
    })
    for (const resource of events.keys()) resource.addEventListener('dispose', () => events.set(resource, events.get(resource) + 1))
    asset.dispose()
    asset.dispose()
    expect([...events.values()].every(count => count === 1)).toBe(true)
  })
})
