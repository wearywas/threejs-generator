import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createButterflySwarm } from './butterflySwarm'

function pose(asset) {
  const values = []
  asset.root.traverse(node => values.push(...node.position, ...node.quaternion, ...node.scale))
  return values
}

describe('butterfly swarm geometry and motion', () => {
  it('has mirrored lobed wings either side of a longitudinal body', () => {
    const asset = createButterflySwarm({ count: 1, wingSpan: 0.5 }, 21)
    const [left, right, body] = asset.root.children[0].children
    for (const wing of [left, right]) {
      wing.rotation.set(0, 0, 0)
      wing.geometry.computeBoundingBox()
      const box = wing.geometry.boundingBox
      expect(box.max.y - box.min.y).toBeLessThan(1e-6)
      expect(box.max.z - box.min.z).toBeGreaterThan(0.2)
      expect(wing.geometry.attributes.position.count).toBeGreaterThan(8)
    }
    left.updateMatrix()
    right.updateMatrix()
    const l = left.geometry.boundingBox.clone().applyMatrix4(left.matrix)
    const r = right.geometry.boundingBox.clone().applyMatrix4(right.matrix)
    expect(l.min.x).toBeGreaterThanOrEqual(0)
    expect(r.max.x).toBeLessThanOrEqual(0)
    expect(l.max.x).toBeCloseTo(-r.min.x)
    const bodySize = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3())
    expect(bodySize.z).toBeGreaterThan(bodySize.x * 3)
    asset.dispose()
  })

  it('flaps out of the wing plane with symmetric tips and a fixed longitudinal hinge', () => {
    const asset = createButterflySwarm({ count: 1 }, 21)
    const [left, right] = asset.root.children[0].children
    const normals = []
    for (const time of [0, 0.13, 0.29]) {
      asset.tick(time)
      const normal = new THREE.Vector3().fromBufferAttribute(left.geometry.attributes.normal, 0)
        .applyQuaternion(left.quaternion)
      normals.push(normal)
      expect(Math.abs(normal.y)).toBeGreaterThan(0.2)
      expect(left.rotation.z).toBeCloseTo(-right.rotation.z)
      expect(left.rotation.x).toBe(0)
      expect(left.rotation.y).toBe(0)
      const leftTip = new THREE.Vector3(0.3, 0, 0).applyQuaternion(left.quaternion)
      const rightTip = new THREE.Vector3(-0.3, 0, 0).applyQuaternion(right.quaternion)
      expect(leftTip.y).toBeCloseTo(rightTip.y)
      expect(leftTip.x).toBeCloseTo(-rightTip.x)
      const hinge = new THREE.Vector3(0, 0, 0.1).applyQuaternion(left.quaternion)
      expect(hinge.toArray()).toEqual([0, 0, 0.1])
    }
    expect(normals[0].distanceTo(normals[1])).toBeGreaterThan(0.05)
    asset.dispose()
  })

  it('has distinct fore/hind lobes without excessive triangles or degenerate faces', () => {
    const asset = createButterflySwarm({ count: 1, wingSpan: 1 }, 21)
    const wing = asset.root.children[0].children[0]
    const flatWing = new THREE.Mesh(wing.geometry, wing.material)
    const hit = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0))
      .intersectObject(flatWing).length > 0
    expect(hit(0.8, -0.3)).toBe(true)
    expect(hit(0.8, 0.03)).toBe(false)
    expect(hit(0.65, 0.3)).toBe(true)
    let triangles = 0
    asset.root.traverse(node => {
      if (!node.isMesh) return
      const { index, attributes } = node.geometry
      const count = index ? index.count : attributes.position.count
      triangles += count / 3
      for (let i = 0; i < count; i += 3) {
        const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(attributes.position, index ? index.getX(i + j) : i + j))
        expect(new THREE.Triangle(...vertices).getArea()).toBeGreaterThan(1e-10)
      }
    })
    expect(triangles).toBeLessThan(300)
    asset.dispose()
  })

  it('points its longitudinal forward axis along flight and starts at time zero', () => {
    const asset = createButterflySwarm({ count: 1 }, 21)
    const initial = pose(asset)
    asset.tick(0)
    expect(pose(asset)).toEqual(initial)
    asset.tick(2)
    const butterfly = asset.root.children[0]
    const position = butterfly.position.clone()
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(butterfly.quaternion)
    asset.tick(2.0001)
    const direction = butterfly.position.clone().sub(position)
    direction.y = 0
    expect(forward.dot(direction.normalize())).toBeGreaterThan(0.999)
    asset.dispose()
  })

  it('preserves the wing texture slot without changing seeded motion', () => {
    const texture = new THREE.Texture()
    // Only replace image loading: these unit tests deliberately have no DOM/network.
    const loader = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(texture)
    try {
      const plain = createButterflySwarm({ count: 2 }, 21)
      const textured = createButterflySwarm({ count: 2 }, 21, { wingTexture: 'wing.png' })
      textured.tick(3)
      plain.tick(3)
      expect(pose(textured)).toEqual(pose(plain))
      expect(textured.root.children[0].children[0].material.map).toBe(texture)
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
      let disposals = 0
      texture.addEventListener('dispose', () => disposals++)
      textured.dispose()
      textured.dispose()
      expect(disposals).toBe(1)
      plain.dispose()
    } finally {
      loader.mockRestore()
    }
  })

  it('keeps zero height variation level and flight centers within the chosen radius', () => {
    const asset = createButterflySwarm({ count: 12, heightVariation: 0, flightRadius: 0.5 }, 21)
    for (const time of [0, 1, 5, 100]) {
      asset.tick(time)
      for (const butterfly of asset.root.children) {
        expect(butterfly.position.y).toBeCloseTo(0.5)
        expect(Math.hypot(butterfly.position.x, butterfly.position.z)).toBeLessThanOrEqual(0.500001)
      }
    }
    asset.dispose()
  })

  it('scales all motion with speed, including radius wobble, and supports seeking', () => {
    const slow = createButterflySwarm({ count: 3, speed: 1 }, 21)
    const fast = createButterflySwarm({ count: 3, speed: 2 }, 21)
    slow.tick(6)
    fast.tick(3)
    expect(pose(slow)).toEqual(pose(fast))
    slow.tick(20)
    slow.tick(6)
    expect(pose(slow)).toEqual(pose(fast))
    slow.dispose()
    fast.dispose()
  })

  it('disposes each shared owned resource only once, including repeated cleanup', () => {
    const asset = createButterflySwarm({ count: 3 }, 21)
    const resources = new Set()
    asset.root.traverse(node => {
      if (node.geometry) resources.add(node.geometry)
      if (node.material) resources.add(node.material)
    })
    const counts = new Map([...resources].map(resource => [resource, 0]))
    resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)))
    asset.dispose()
    asset.dispose()
    expect([...counts.values()]).toEqual([...resources].map(() => 1))
  })
})
