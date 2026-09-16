import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { createBuildingModular } from './buildingModular'

describe('createBuildingModular', () => {
  it('gives the timber style actual floor-height posts and horizontal rails', () => {
    const asset = createBuildingModular({ styleKit: 'medieval_timber' }, 2106)
    try {
      const facades = asset.root.children.filter(child => child.name.startsWith('facade_'))
      expect(facades.length).toBeGreaterThan(0)
      for (const facade of facades) {
        const frame = facade.getObjectByName('timberFrame')
        expect(frame).toBeTruthy()
        const sizes = frame.children.map(beam => new THREE.Box3().setFromObject(beam).getSize(new THREE.Vector3()))
        expect(sizes.some(size => size.y > 2 && size.x < 0.31 && size.z < 0.31)).toBe(true)
        expect(sizes.some(size => Math.max(size.x, size.z) > 2 && size.y < 0.3)).toBe(true)
      }
    } finally { asset.dispose() }
  })

  it('does not add timber framing to other style kits', () => {
    const asset = createBuildingModular({ styleKit: 'industrial_brick' }, 2106)
    try { expect(asset.root.getObjectByName('timberFrame')).toBeUndefined() }
    finally { asset.dispose() }
  })

  it('disposes shared geometry, materials, and generated textures once', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    const asset = createBuildingModular({ styleKit: 'industrial_brick' }, 2106, {}, { textures: { makeBrick: () => texture } })
    const events = new Map([[texture, 0]])
    asset.root.traverse(object => {
      for (const resource of [object.geometry, ...[object.material].flat()].filter(Boolean)) events.set(resource, 0)
    })
    for (const resource of events.keys()) resource.addEventListener('dispose', () => events.set(resource, events.get(resource) + 1))
    asset.dispose()
    asset.dispose()
    expect([...events.values()].every(count => count === 1)).toBe(true)
  })

  it('applies watchtower archetype overrides to the generated structure', () => {
    const asset = createBuildingModular({
      archetype: 'watchtower',
      footprint: { shape: 'rectangle', width: 10, depth: 8 },
      floors: 2,
      styleKit: 'coastal_wood',
      roofType: 'flat',
      hasChimney: false,
      hasFoundation: true,
      hasCornice: true
    }, 101)

    expect(asset.root.getObjectByName('conicalRoof')).toBeTruthy()
    expect(asset.root.children.filter(child => child.name.startsWith('facade_')).length).toBeGreaterThanOrEqual(16)
  })
})
