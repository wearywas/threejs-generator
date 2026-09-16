import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createParticleSystem } from './particleSystem'

function snapshot(asset) {
  return asset.root.children.map(points => ({
    positions: [...points.geometry.attributes.position.array],
    colors: points.geometry.attributes.color ? [...points.geometry.attributes.color.array] : [],
  }))
}

describe('particle system time-based animation', () => {
  it.each(['fireflies', 'snow', 'embers', 'dust', 'sparkles'])('%s is independent of tick history and can seek', type => {
    const a = createParticleSystem({ type, count: 20 }, 42)
    const b = createParticleSystem({ type, count: 20 }, 42)
    for (let i = 0; i < 120; i++) a.tick(i / 60)
    a.tick(2)
    b.tick(2)
    expect(snapshot(a)).toEqual(snapshot(b))
    a.tick(1000)
    a.tick(2)
    expect(snapshot(a)).toEqual(snapshot(b))
    a.tick(2)
    expect(snapshot(a)).toEqual(snapshot(b))
    a.dispose()
    b.dispose()
  })

  it.each(['fireflies', 'snow', 'embers', 'dust', 'sparkles'])('%s respects speed and remains within its area', type => {
    const a = createParticleSystem({ type, count: 20, area: 2, speed: 1 }, 42)
    const b = createParticleSystem({ type, count: 20, area: 2, speed: 2 }, 42)
    a.tick(8)
    b.tick(4)
    expect(snapshot(a)).toEqual(snapshot(b))
    a.tick(10000)
    const positions = a.root.children[0].geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      expect(Math.abs(positions.getX(i))).toBeLessThanOrEqual(1.00001)
      expect(Math.abs(positions.getZ(i))).toBeLessThanOrEqual(1.00001)
      expect(positions.getY(i)).toBeGreaterThanOrEqual(0)
      expect(positions.getY(i)).toBeLessThanOrEqual(2.00001)
    }
    a.dispose()
    b.dispose()
  })

  it.each(['fireflies', 'embers', 'sparkles'])('%s varies supported vertex brightness, not an unused size attribute', type => {
    const asset = createParticleSystem({ type, count: 20, size: 0.07 }, 42)
    asset.tick(0)
    const before = snapshot(asset)[0].colors
    asset.tick(0.27)
    expect(snapshot(asset)[0].colors).not.toEqual(before)
    for (const points of asset.root.children) {
      expect(points.material.isPointsMaterial).toBe(true)
      expect(points.material.vertexColors).toBe(true)
      expect(points.geometry.attributes.size).toBeUndefined()
    }
    expect(asset.root.children[0].material.size).toBe(0.07)
    asset.dispose()
  })

  it('provides a DOM-free soft radial sprite and keeps glow aligned', () => {
    const asset = createParticleSystem({ count: 10, glow: true }, 42)
    const map = asset.root.children[0].material.map
    expect(map?.isDataTexture).toBe(true)
    const { data, width, height } = map.image
    expect(data[3]).toBe(0)
    expect(data[((Math.floor(height / 2) * width + Math.floor(width / 2)) * 4) + 3]).toBeGreaterThan(200)
    asset.tick(7)
    expect(snapshot(asset)[0].positions).toEqual(snapshot(asset)[1].positions)
    asset.dispose()
  })

  it('starts in its time-zero pose and disposes shared resources once', () => {
    const asset = createParticleSystem({ count: 10 }, 42)
    const initial = snapshot(asset)
    asset.tick(0)
    expect(snapshot(asset)).toEqual(initial)
    const resources = new Set()
    asset.root.traverse(node => {
      if (node.geometry) resources.add(node.geometry)
      if (node.material) resources.add(node.material)
      if (node.material?.map) resources.add(node.material.map)
    })
    const counts = new Map([...resources].map(resource => [resource, 0]))
    resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)))
    asset.dispose()
    asset.dispose()
    expect([...counts.values()]).toEqual([...resources].map(() => 1))
  })

  it('preserves uploaded sprite ownership and the no-glow option', () => {
    const texture = new THREE.Texture()
    const loader = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(texture)
    try {
      const asset = createParticleSystem({ count: 10, glow: false }, 42, { particleTexture: 'sprite.png' })
      expect(asset.root.children).toHaveLength(1)
      expect(asset.root.children[0].material.map).toBe(texture)
      expect(asset.root.children[0].material.blending).toBe(THREE.NormalBlending)
      let disposals = 0
      texture.addEventListener('dispose', () => disposals++)
      asset.dispose()
      asset.dispose()
      expect(disposals).toBe(1)
    } finally {
      loader.mockRestore()
    }
  })
})
