import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createSimpleBuilding } from './simpleBuilding'

afterEach(() => vi.restoreAllMocks())

describe('createSimpleBuilding resource ownership', () => {
  it.each(['cottage', 'cabin', 'tower', 'shed'])('releases every %s geometry and material once, including glass and shared beams', style => {
    const asset = createSimpleBuilding({ style }, 42)
    const releases = new Map()
    asset.root.traverse(child => {
      for (const resource of [child.geometry, child.material].filter(Boolean)) {
        if (releases.has(resource)) continue
        releases.set(resource, 0)
        resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource) + 1))
      }
    })
    expect([...releases.keys()].some(resource => resource.isMaterial && resource.transparent)).toBe(true)
    asset.dispose()
    expect([...releases.values()].every(count => count === 1)).toBe(true)
    asset.dispose()
    expect([...releases.values()].every(count => count === 1)).toBe(true)
  })

  it('releases trim even when no building part uses it', () => {
    // Observe the actual disposal event path for the otherwise unreachable trim.
    const dispose = vi.spyOn(THREE.Material.prototype, 'dispose')
    const asset = createSimpleBuilding({ style: 'shed', roofType: 'flat', hasDoor: false, hasWindows: false, hasChimney: false }, 9)
    asset.dispose()
    asset.dispose()
    expect(new Set(dispose.mock.contexts).size).toBe(3)
    expect(dispose.mock.calls).toHaveLength(3)
  })

  it('releases loaded maps once without loading any images in the test', () => {
    const maps = [new THREE.Texture(), new THREE.Texture()]
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementationOnce(() => maps[0]).mockImplementationOnce(() => maps[1])
    const releases = [0, 0]
    maps.forEach((map, i) => map.addEventListener('dispose', () => releases[i]++))
    const asset = createSimpleBuilding({}, 42, { wallTexture: 'test-wall', roofTexture: 'test-roof' })
    const usedMaps = new Set()
    asset.root.traverse(child => { if (child.material?.map) usedMaps.add(child.material.map) })
    expect(usedMaps).toEqual(new Set(maps))
    asset.dispose()
    asset.dispose()
    expect(releases).toEqual([1, 1])
  })
})
