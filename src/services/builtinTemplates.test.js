import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { getGeneratorNames } from '../generators'
import { validateSpec } from '../schemas/assetSpec'
import { createAsset } from '../runtime/AssetFactory'
import { createAssetDocument } from './assetDocument'
import { builtinTemplates } from './builtinTemplates'

describe('built-in templates', () => {
  it('lets timber-house controls change the rendered roof, chimney, and floor count', () => {
    const { document } = builtinTemplates.find(entry => entry.id === 'timber-house')
    const build = params => createAsset({ ...document.spec, params: { ...document.params, ...params } })
    const snapshot = asset => {
      const objects = []
      asset.root.traverse(object => {
        if (object.geometry) objects.push({
          positions: Array.from(object.geometry.attributes.position.array),
          position: object.position.toArray(), scale: object.scale.toArray(), quaternion: object.quaternion.toArray(),
        })
      })
      return objects
    }
    const initial = build({})
    try {
      const baseline = snapshot(initial)
      for (const patch of [{ roofType: 'flat' }, { hasChimney: !document.params.hasChimney }, { floors: 1 }]) {
        const changed = build(patch)
        try { expect(snapshot(changed), JSON.stringify(patch)).not.toEqual(baseline) }
        finally { changed.dispose() }
      }
    } finally { initial.dispose() }
  })

  it('ships exactly one template per registered generator with unique thumbnail paths', () => {
    expect(builtinTemplates).toHaveLength(7)
    expect(builtinTemplates.map(entry => entry.document.spec.generator).sort()).toEqual(getGeneratorNames().sort())
    expect(new Set(builtinTemplates.map(entry => entry.id)).size).toBe(7)
    for (const entry of builtinTemplates) {
      expect(entry.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(entry.name.trim()).not.toBe('')
      expect(entry.description.trim()).not.toBe('')
      expect(entry.thumbnail).toBe(`/templates/${entry.id}.png`)
    }
  })

  it('provides valid curated documents with explicit seeds and no external textures', () => {
    for (const { name, document } of builtinTemplates) {
      expect(document.mode).toBe('curated')
      expect(document.prompt).toBe(name)
      expect(Number.isSafeInteger(document.seed)).toBe(true)
      expect(document.spec.seed).toBe(document.seed)
      expect(document.textures).toEqual({})
      expect(validateSpec(document.spec)).toEqual(document.spec)
    }
  })

  it('creates real nonempty finite geometry with callable, idempotent disposal', () => {
    for (const { document } of builtinTemplates) {
      const asset = createAsset(document.spec)
      const disposed = new Set()
      const resources = new Set()
      asset.root.traverse(object => {
        if (object.geometry) resources.add(object.geometry)
        for (const material of [object.material].flat().filter(Boolean)) resources.add(material)
      })
      for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource))
      try {
        asset.tick?.(1.5, 1 / 60)
        const box = new THREE.Box3().setFromObject(asset.root)
        expect(box.isEmpty()).toBe(false)
        expect([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)).toBe(true)
        expect(box.getSize(new THREE.Vector3()).length()).toBeGreaterThan(0)
        expect(resources.size).toBeGreaterThan(0)
      } finally {
        asset.dispose()
      }
      expect(disposed.size, document.spec.generator).toBe(resources.size)
      expect(() => asset.dispose()).not.toThrow()
    }
  })

  it('keeps the catalog deeply immutable and each load independently copied', () => {
    const assertFrozen = value => {
      if (!value || typeof value !== 'object') return
      expect(Object.isFrozen(value)).toBe(true)
      Object.values(value).forEach(assertFrozen)
    }
    assertFrozen(builtinTemplates)
    for (const { document } of builtinTemplates) {
      const first = createAssetDocument(document)
      const second = createAssetDocument(document)
      expect(first).toEqual(second)
      expect(first.spec.params).not.toBe(second.spec.params)
      expect(first.spec.params).not.toBe(document.spec.params)
      const editable = JSON.parse(JSON.stringify(first))
      editable.params = { ...editable.params, ...Object.fromEntries(Object.keys(editable.params).map(key => [key, null])) }
      editable.textures.example = 'changed'
      expect(second).toEqual(document)
      expect(() => { first.spec.params.changed = true }).toThrow()
    }
  })
})
