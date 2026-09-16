import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import {
  getCodeSystemPrompt,
  getCriticRegenerationPrompt,
  getRepairPrompt
} from './codeSystemPrompt'

function createSwayExample() {
  const section = getCodeSystemPrompt().split('**Horizontal Sway')[1]
  const example = section.match(/```javascript\s*([\s\S]*?)```/)[1].split('// WRONG:')[0]
  const mesh = new THREE.Object3D()
  mesh.position.set(2, 3, 4)
  mesh.rotation.z = 0.2
  // Run either a factory-scoped example exposing update, or an older per-frame
  // snippet. Both exercise the actual prompt code rather than a copied formula.
  const run = new Function('mesh', 'speed', 'time', `${example}\nreturn typeof update === 'function' ? update : null;`)
  const update = run(mesh, 1, 0) || (time => run(mesh, 1, time))
  return { mesh, update }
}

describe('getCodeSystemPrompt', () => {
  it('keeps the base-pivot sway centered around the existing resting tilt', () => {
    const section = getCodeSystemPrompt().split('**Rotation for Sway:**')[1]
    const example = section.match(/```javascript\s*([\s\S]*?)```/)[1]
    const mesh = new THREE.Object3D()
    mesh.rotation.set(0.3, 0.2, 0.4)
    const run = new Function('mesh', 'windSpeed', 'offset', 'swayAmount', 'time', `${example}\nreturn typeof update === 'function' ? update : null;`)
    const update = run(mesh, 1, 0, 0.1, 0) || (time => run(mesh, 1, 0, 0.1, time))
    for (let i = 0; i < 100; i++) update(Math.PI / 2)
    expect(mesh.rotation.z).toBeCloseTo(0.5)
    update(0)
    expect(mesh.rotation.z).toBeCloseTo(0.4)
    expect(mesh.rotation.x).toBeCloseTo(0.35)
    expect(mesh.rotation.y).toBe(0.2)
  })

  it('keeps the horizontal sway example anchored when the same frame is replayed', () => {
    const { mesh, update } = createSwayExample()
    for (let i = 0; i < 1000; i++) update(Math.PI / 2, 1 / 60)
    expect(mesh.position.x).toBeCloseTo(2.05)
    update(0, 0)
    expect(mesh.position.toArray()).toEqual([2, 3, 4])
    expect(mesh.rotation.z).toBeCloseTo(0.2)
  })

  it.each([30, 60, 144])('keeps the sway example bounded at %i fps', fps => {
    const { mesh, update } = createSwayExample()
    for (let frame = 1; frame <= fps * 10; frame++) {
      update(frame / fps, 1 / fps)
      expect(Math.abs(mesh.position.x - 2)).toBeLessThanOrEqual(0.05000001)
    }
    expect(mesh.position.x).toBeCloseTo(1.9727989445)
  })

  it('adds environment family guidance for ground cover assets', () => {
    const prompt = getCodeSystemPrompt([], { assetFamily: 'groundCover' })

    expect(prompt).toContain('Asset family: groundCover')
    expect(prompt).toContain('Ground cover should grow from tight shared root areas')
    expect(prompt).not.toContain('Roof silhouette should stay readable from distance')
  })

  it('adds architecture family guidance for tower assets', () => {
    const prompt = getCodeSystemPrompt([], { assetFamily: 'tower' })

    expect(prompt).toContain('Asset family: tower')
    expect(prompt).toContain('Roof silhouette should stay readable from distance')
    expect(prompt).toContain('Plan the structure before coding')
  })

  it('adds explicit assembly guidance for tree assets', () => {
    const prompt = getCodeSystemPrompt([], { assetFamily: 'treePlant' })

    expect(prompt).toContain('Asset family: treePlant')
    expect(prompt).toContain('trunk form and taper')
    expect(prompt).toContain('2-4 canopy masses')
    expect(prompt).toContain('root flare or exposed roots')
    expect(prompt).toContain('broadleaf trees should use anchored canopy lobes')
    expect(prompt).toContain('one readable leader')
    expect(prompt).toContain('branch whorls or staggered branch tiers')
    expect(prompt).toContain('broader lower boughs')
    expect(prompt).toContain('exposed branch intervals')
    expect(prompt).toContain('negative space between foliage pads')
    expect(prompt).toContain('evenly stacked cone/disc repetition')
  })

  it('builds a structured repair prompt for sandbox validation failures', () => {
    const prompt = getRepairPrompt(
      'function createAsset() {}',
      'Code contains potentially dangerous pattern: /\\bwindow\\s*\\./',
      {
        category: 'sandbox_validation',
        diagnostics: {
          offendingPattern: '/\\bwindow\\s*\\./'
        }
      }
    )

    expect(prompt).toContain('Failure category: sandbox_validation')
    expect(prompt).toContain('Blocked pattern: /\\bwindow\\s*\\./')
    expect(prompt).toContain('Do not use browser globals')
  })

  it('builds a critic regeneration prompt from the original prompt and feedback', () => {
    const prompt = getCriticRegenerationPrompt({
      originalPrompt: 'a weathered stone watchtower with a timber roof',
      criticFeedback: 'Architecture asset looks fragmented instead of reading as a few strong masses.',
      assetFamily: 'tower'
    })

    expect(prompt).toContain('a weathered stone watchtower with a timber roof')
    expect(prompt).toContain('Architecture asset looks fragmented')
    expect(prompt).toContain('Asset family: tower')
    expect(prompt).toContain('Generate a fresh replacement')
  })

  it('adds structure-first retry guidance for rejected tree prompts', () => {
    const prompt = getCriticRegenerationPrompt({
      originalPrompt: 'a windswept pine tree on a rocky hill',
      criticFeedback: 'The pine reads as repeated stacked foliage tiers with little visible branch support.',
      assetFamily: 'treePlant'
    })

    expect(prompt).toContain('Critic feedback: The pine reads as repeated stacked foliage tiers with little visible branch support.')
    expect(prompt).toContain('one readable leader')
    expect(prompt).toContain('branch whorls or staggered branch tiers')
    expect(prompt).toContain('supported snow placement')
    expect(prompt).toContain('Do not use evenly stacked cone/disc repetition')
  })
})
