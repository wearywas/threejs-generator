import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { canRenderOnDemand } from './renderPolicy.js'
import { createAsset } from './AssetFactory.js'
import { executeFactory } from './isolated/factory.js'

const staticAsset = () => ({
  hasAnimation: false,
  root: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
})

describe('conservative render-on-demand eligibility', () => {
  it.each([undefined, null, {}, { root: new THREE.Group() }, { hasAnimation: false },
    { hasAnimation: false, root: {} }, { hasAnimation: 0, root: new THREE.Group() }])(
    'keeps unknown or malformed assets continuous: %j', asset => {
      expect(canRenderOnDemand(asset)).toBe(false)
    })

  it('allows explicitly static ordinary geometry without mutating it', () => {
    const asset = staticAsset()
    const before = asset.root.toJSON()
    expect(canRenderOnDemand(asset)).toBe(true)
    expect(asset.root.toJSON()).toEqual(before)
  })

  it('keeps explicitly animated assets continuous', () => {
    expect(canRenderOnDemand({ ...staticAsset(), hasAnimation: true })).toBe(false)
  })

  it.each(['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow'])(
    'rejects a descendant %s hook even when hidden', hook => {
      const asset = staticAsset()
      const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
      child.visible = false
      child[hook] = () => { throw new Error('Classification must not execute hooks') }
      asset.root.add(child)
      expect(canRenderOnDemand(asset)).toBe(false)
    })

  it('rejects inherited render hooks', () => {
    class AnimatedMesh extends THREE.Mesh { onBeforeRender() {} }
    expect(canRenderOnDemand({ hasAnimation: false, root: new AnimatedMesh() })).toBe(false)
  })

  it.each([
    [THREE.Object3D.prototype, 'onBeforeRender'],
    [THREE.Material.prototype, 'onBeforeRender'],
    [THREE.Material.prototype, 'onBeforeCompile'],
  ])('rejects hooks changed on the shared prototype after startup', (prototype, hook) => {
    const original = prototype[hook]
    try {
      prototype[hook] = () => {}
      expect(canRenderOnDemand(staticAsset())).toBe(false)
    } finally {
      prototype[hook] = original
    }
  })

  it.each(['onBeforeRender', 'onBeforeCompile', 'customProgramCacheKey'])(
    'rejects a material %s override in any material slot', hook => {
      const asset = staticAsset()
      const custom = new THREE.MeshStandardMaterial()
      custom[hook] = () => {}
      asset.root.material = [asset.root.material, custom]
      expect(canRenderOnDemand(asset)).toBe(false)
    })

  it.each([THREE.ShaderMaterial, THREE.RawShaderMaterial])('rejects shader material %s', Material => {
    const asset = staticAsset()
    asset.root.material = new Material()
    expect(canRenderOnDemand(asset)).toBe(false)
  })

  it('rejects unknown material subclasses', () => {
    class CustomMaterial extends THREE.MeshStandardMaterial {}
    const asset = staticAsset()
    asset.root.material = new CustomMaterial()
    expect(canRenderOnDemand(asset)).toBe(false)
  })

  it.each(['customDepthMaterial', 'customDistanceMaterial'])(
    'rejects %s even with otherwise ordinary geometry', key => {
      const asset = staticAsset()
      asset.root[key] = new THREE.MeshDepthMaterial()
      expect(canRenderOnDemand(asset)).toBe(false)
    })

  it.each([
    ['canvas', () => new THREE.CanvasTexture({ width: 4, height: 4 })],
    ['video', () => new THREE.VideoTexture({})],
    ['render target', () => new THREE.WebGLRenderTarget(4, 4).texture],
    ['framebuffer', () => new THREE.FramebufferTexture(4, 4)],
    ['canvas in ordinary texture', () => new THREE.Texture({ getContext() {} })],
    ['video in ordinary texture', () => new THREE.Texture({ nodeName: 'VIDEO' })],
    ['dynamic flag', () => Object.assign(new THREE.Texture(), { isDynamicTexture: true })],
    ['upload hook', () => Object.assign(new THREE.Texture(), { onUpdate() {} })],
  ])('rejects %s textures', (_label, texture) => {
    const asset = staticAsset()
    asset.root.material.alphaMap = texture()
    expect(canRenderOnDemand(asset)).toBe(false)
  })

  it('checks scene background and environment textures too', () => {
    const root = new THREE.Scene()
    root.environment = new THREE.CanvasTexture({})
    expect(canRenderOnDemand({ hasAnimation: false, root })).toBe(false)
  })

  it.each([() => new THREE.DataTexture(new Uint8Array(4), 1, 1),
    () => new THREE.Texture({ nodeName: 'IMG', complete: true, naturalWidth: 4, naturalHeight: 4 }),
    () => new THREE.Texture({ width: 4, height: 4 })])(
    'allows fully loaded ordinary static textures', texture => {
      const asset = staticAsset()
      asset.root.material.map = texture()
      expect(canRenderOnDemand(asset)).toBe(true)
    })

  it.each([() => new THREE.Texture(),
    () => new THREE.Texture({ nodeName: 'IMG', complete: false, width: 4, height: 4 }),
    () => new THREE.Texture({ nodeName: 'IMG', complete: true, naturalWidth: 0, naturalHeight: 0 }),
    () => new THREE.CubeTexture([{ width: 4, height: 4 }]),
    () => new THREE.Texture({})])('keeps missing, incomplete, failed, or unknown texture sources continuous', texture => {
      const asset = staticAsset()
      asset.root.material.map = texture()
      expect(canRenderOnDemand(asset)).toBe(false)
    })

  it.each([
    ['skinning', asset => { asset.root = new THREE.SkinnedMesh() }],
    ['morph influences', asset => { asset.root.morphTargetInfluences = [0, 0.2] }],
    ['instanced morph texture', asset => { asset.root.morphTexture = new THREE.DataTexture() }],
    ['animation clips', asset => { asset.root.animations = [new THREE.AnimationClip()] }],
    ['LOD', asset => { asset.root.add(new THREE.LOD()) }],
    ['dynamic geometry', asset => { asset.root.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage) }],
  ])('keeps %s continuous', (_label, change) => {
    const asset = staticAsset()
    change(asset)
    expect(canRenderOnDemand(asset)).toBe(false)
  })

  it('allows regular static instancing', () => {
    const asset = staticAsset()
    asset.root = new THREE.InstancedMesh(asset.root.geometry, asset.root.material, 2)
    expect(canRenderOnDemand(asset)).toBe(true)
  })

  it('allows the isolated factory no-op wrappers only with its explicit static declaration', async () => {
    const asset = await executeFactory('function createAsset(THREE) { return { root: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()) } }')
    try { expect(canRenderOnDemand(asset)).toBe(true) }
    finally { asset.dispose() }
  })

  it('does not freeze a render-hook animation just because the factory has no update callback', async () => {
    const asset = await executeFactory(`function createAsset(THREE) {
      const root = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
      root.onBeforeRender = () => { root.rotation.y += 0.01; };
      return { root };
    }`)
    try {
      expect(asset.hasAnimation).toBe(false)
      expect(canRenderOnDemand(asset)).toBe(false)
    } finally { asset.dispose() }
  })

  it.each([
    ['rockCluster', { count: 1 }, true],
    ['proceduralTree', { windSway: false }, true],
    ['proceduralTree', { windSway: true }, false],
    ['butterflySwarm', { count: 1 }, false],
  ])('classifies trusted curated %s with %j', (generator, params, expected) => {
    const asset = createAsset({ generator, params, seed: 42 })
    try { expect(canRenderOnDemand(asset)).toBe(expected) }
    finally { asset.dispose() }
  })
})
