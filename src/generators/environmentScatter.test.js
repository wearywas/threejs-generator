import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import * as environmentKits from './environmentKits'

import { createEnvironmentScatter } from './environmentScatter'

afterEach(() => vi.restoreAllMocks())

const propTypes = ['tree', 'rock', 'grass', 'bush', 'flower']
const scatterParams = { area: 16, density: 1, minDistance: 1.5 }

function matrices(asset) {
  return asset.root.children.map(mesh => [mesh.name, mesh.count, Array.from(mesh.instanceMatrix.array)])
}

function scales(asset) {
  // First batch is the trunk/stem or entire prop, without canopy proportions.
  const mesh = asset.root.children[0]
  const matrix = new THREE.Matrix4()
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix)
    return new THREE.Vector3().setFromMatrixScale(matrix).x
  })
}

describe('scatter variation and ownership', () => {
  it.each(propTypes)('tints %s deterministically without changing matrices or batch counts', propType => {
    const params = { ...scatterParams, propType }
    const plain = createEnvironmentScatter({ ...params, colorVariation: 0 }, 91)
    const tinted = createEnvironmentScatter({ ...params, colorVariation: 0.5 }, 91)
    const repeat = createEnvironmentScatter({ ...params, colorVariation: 0.5 }, 91)
    const subtle = createEnvironmentScatter({ ...params, colorVariation: 0.2 }, 91)
    const differentSeed = createEnvironmentScatter({ ...params, colorVariation: 0.5 }, 92)
    expect(matrices(tinted)).toEqual(matrices(plain))
    expect(matrices(repeat)).toEqual(matrices(plain))
    tinted.root.children.forEach((mesh, index) => {
      expect(mesh.isInstancedMesh).toBe(true)
      expect(mesh.instanceColor).toBeTruthy()
      const colors = Array.from(mesh.instanceColor.array)
      expect(colors.every(Number.isFinite)).toBe(true)
      expect(new Set(colors).size).toBeGreaterThan(1)
      expect(colors).toEqual(Array.from(repeat.root.children[index].instanceColor.array))
      expect(colors).not.toEqual(Array.from(differentSeed.root.children[index].instanceColor.array))
      const subtleColors = Array.from(subtle.root.children[index].instanceColor.array)
      expect(Math.max(...colors.map(value => Math.abs(value - 1))))
        .toBeGreaterThan(Math.max(...subtleColors.map(value => Math.abs(value - 1))))
      // Instance colors multiply the kit color; do not square the base tint.
      const base = plain.root.children[index].material.color
      const effective = new THREE.Color()
      for (let i = 0; i < mesh.count; i++) {
        mesh.getColorAt(i, effective)
        effective.multiply(mesh.material.color)
        for (const channel of ['r', 'g', 'b']) {
          expect(effective[channel] / base[channel]).toBeGreaterThanOrEqual(0.5 - 1e-6)
          expect(effective[channel] / base[channel]).toBeLessThanOrEqual(1.5 + 1e-6)
        }
      }
      const plainMesh = plain.root.children[index]
      if (plainMesh.instanceColor) {
        expect(Array.from(plainMesh.instanceColor.array).every(value => value === 1)).toBe(true)
      }
      expect(mesh.material.color.equals(base)).toBe(true)
      expect(mesh.instanceColor.version).toBeGreaterThan(0)
    })
    ;[plain, tinted, repeat, subtle, differentSeed].forEach(asset => asset.dispose())
  })

  it.each(propTypes)('centers %s scale variation on one, remaining positive at maximum', propType => {
    const params = { ...scatterParams, propType }
    const uniform = createEnvironmentScatter({ ...params, scaleVariation: 0 }, 91)
    scales(uniform).forEach(scale => expect(scale).toBeCloseTo(1, 5))
    const varied = createEnvironmentScatter({ ...params, scaleVariation: 1 }, 91)
    const values = scales(varied)
    expect(values.every(value => Number.isFinite(value) && value > 0 && value < 2)).toBe(true)
    expect(Math.min(...values)).toBeLessThan(0.8)
    expect(Math.max(...values)).toBeGreaterThan(1.2)
    expect(Math.abs(values.reduce((sum, value) => sum + value, 0) / values.length - 1)).toBeLessThan(0.15)
    varied.root.children.forEach(mesh => expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(true))
    expect(varied.root.children[0].count).toBe(uniform.root.children[0].count)
    uniform.dispose()
    varied.dispose()
  })

  it.each([...propTypes, 'empty'])('releases all owned %s kit resources and GPU instance buffers once', propType => {
    // Capture the real library, including resources absent from the scene graph.
    const kits = environmentKits.createEnvironmentKitLibrary()
    const sharedMap = new THREE.Texture()
    kits.pineTrunk.material.map = sharedMap
    kits.baseFlare.material.map = sharedMap
    vi.spyOn(environmentKits, 'createEnvironmentKitLibrary').mockReturnValue(kits)
    const resources = new Set([sharedMap])
    Object.values(kits).forEach(kit => {
      const parts = kit.geometry ? [kit] : Object.values(kit)
      parts.forEach(part => { resources.add(part.geometry); resources.add(part.material) })
    })
    const asset = createEnvironmentScatter({ ...scatterParams, propType: propType === 'empty' ? 'tree' : propType, density: propType === 'empty' ? 0 : 1 }, 91)
    asset.root.traverse(child => { if (child.isInstancedMesh) resources.add(child) })
    const releases = new Map([...resources].map(resource => [resource, 0]))
    for (const resource of resources) {
      resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource) + 1))
    }
    asset.dispose()
    expect([...releases.values()].every(count => count === 1)).toBe(true)
    asset.dispose()
    expect([...releases.values()].every(count => count === 1)).toBe(true)
  })
})

describe('createEnvironmentScatter', () => {
  it('builds trees from connected trunk and canopy kit pieces', () => {
    const asset = createEnvironmentScatter({
      area: 12,
      propType: 'tree',
      density: 0.35,
      minDistance: 3
    }, 42)

    const childNames = asset.root.children.map(child => child.name)

    expect(childNames).toEqual(
      expect.arrayContaining([
        'tree_trunks',
        'tree_base_flares',
        'tree_branch_segments',
        'tree_canopy_primary',
        'tree_canopy_secondary',
        'tree_surface_roots'
      ])
    )
  })

  it('builds flower patches with stems and blossoms instead of single dots', () => {
    const asset = createEnvironmentScatter({
      area: 10,
      propType: 'flower',
      density: 0.55,
      minDistance: 1.5
    }, 77)

    const childNames = asset.root.children.map(child => child.name)

    expect(childNames).toEqual(
      expect.arrayContaining([
        'flower_stems',
        'flower_blossoms'
      ])
    )
  })
})
