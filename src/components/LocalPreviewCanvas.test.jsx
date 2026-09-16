import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createPreviewRenderState, captureLocalPreviewThumbnail } from './LocalPreviewCanvas.jsx'

const cleanups = []
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()) })

function preview() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000)
  camera.position.set(5, 4, 5)
  const canvas = Object.assign(new EventTarget(), {
    style: {}, clientWidth: 800, clientHeight: 400, width: 1600, height: 800,
    getRootNode() { return this },
    toDataURL() { return 'data:image/png;base64,thumbnail' },
  })
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  const draws = []
  let pixelRatio = 2
  // Only the unavailable GPU/canvas boundary is replaced; geometry, camera,
  // controls, their damping, and the production render decisions are real.
  const renderer = {
    domElement: canvas,
    shadowMap: { autoUpdate: true, needsUpdate: false },
    getPixelRatio() { return pixelRatio },
    setPixelRatio(value) { pixelRatio = value },
    setSize(width, height) { canvas.width = width * pixelRatio; canvas.height = height * pixelRatio },
    render(renderScene, renderCamera) {
      draws.push({ scene: renderScene, camera: renderCamera, width: canvas.width, height: canvas.height,
        position: renderCamera.position.clone(), aspect: renderCamera.aspect,
        shadowPass: this.shadowMap.autoUpdate || this.shadowMap.needsUpdate })
      this.shadowMap.needsUpdate = false
    },
  }
  const asset = { hasAnimation: false, root: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()) }
  scene.add(asset.root)
  const renderState = createPreviewRenderState(renderer, controls)
  cleanups.push(() => { renderState.dispose(); controls.dispose(); asset.root.geometry.dispose(); asset.root.material.dispose() })
  renderState.setAsset(asset)
  return { renderer, scene, camera, controls, asset, renderState, draws, canvas }
}

describe('local preview render and shadow invalidation', () => {
  it('renders a static asset once and skips clean GPU frames', () => {
    const p = preview()
    for (let frame = 0; frame < 10; frame++) p.renderState.render(p.scene, p.camera)
    expect(p.draws).toHaveLength(1)
    expect(p.draws[0].shadowPass).toBe(true)
  })

  it('redraws camera changes without regenerating static shadow maps', () => {
    const p = preview()
    p.renderState.render(p.scene, p.camera)
    p.camera.position.x += 1
    p.controls.update()
    p.renderState.render(p.scene, p.camera)
    p.renderState.render(p.scene, p.camera)
    expect(p.draws.map(draw => draw.shadowPass)).toEqual([true, false])
    expect(p.draws[1].position.x).toBeCloseTo(6)
  })

  it('keeps redrawing real OrbitControls damping until the camera settles', () => {
    const p = preview()
    p.renderState.render(p.scene, p.camera)
    p.controls.listenToKeyEvents(p.canvas)
    const pan = Object.assign(new Event('keydown', { cancelable: true }), { code: 'ArrowRight' })
    p.canvas.dispatchEvent(pan)
    for (let frame = 0; frame < 300; frame++) {
      p.controls.update()
      p.renderState.render(p.scene, p.camera)
    }
    expect(p.draws.length).toBeGreaterThan(2)
    expect(p.draws.length).toBeLessThan(300)
    expect(p.draws.filter(draw => draw.shadowPass)).toHaveLength(1)
    const settledCount = p.draws.length
    p.controls.update()
    p.renderState.render(p.scene, p.camera)
    expect(p.draws).toHaveLength(settledCount)
  })

  it('redraws explicit resize invalidation once using the new dimensions', () => {
    const p = preview()
    p.renderState.render(p.scene, p.camera)
    p.renderer.setSize(500, 300)
    p.renderState.invalidate()
    p.renderState.render(p.scene, p.camera)
    p.renderState.render(p.scene, p.camera)
    expect(p.draws.map(draw => [draw.width, draw.height, draw.shadowPass])).toEqual([
      [1600, 800, true], [1000, 600, false],
    ])
  })

  it('refreshes shadows on asset replacement and removal', () => {
    const p = preview()
    p.renderState.render(p.scene, p.camera)
    p.renderState.setAsset({ ...p.asset })
    p.renderState.render(p.scene, p.camera)
    p.renderState.render(p.scene, p.camera)
    p.renderState.setAsset(null)
    p.renderState.render(p.scene, p.camera)
    p.renderState.render(p.scene, p.camera)
    expect(p.draws.map(draw => draw.shadowPass)).toEqual([true, true, true])
  })

  it.each([undefined, true])('keeps rendering and updating shadows for hasAnimation=%s', hasAnimation => {
    const p = preview()
    p.renderState.setAsset({ ...p.asset, hasAnimation })
    for (let frame = 0; frame < 3; frame++) p.renderState.render(p.scene, p.camera)
    expect(p.draws.map(draw => draw.shadowPass)).toEqual([true, true, true])
  })

  it('does not freeze texture completion or its shadows when attached before loading', () => {
    const p = preview()
    const texture = new THREE.Texture()
    p.asset.root.material.alphaMap = texture
    p.renderState.setAsset(p.asset)
    p.renderState.render(p.scene, p.camera)
    texture.image = { nodeName: 'IMG', complete: true, naturalWidth: 4, naturalHeight: 4 }
    texture.needsUpdate = true
    p.renderState.render(p.scene, p.camera)
    p.renderState.render(p.scene, p.camera)
    expect(p.draws.map(draw => draw.shadowPass)).toEqual([true, true, true])
    texture.dispose()
  })

  it('returns to cached shadows when an animated asset is replaced by a static asset', () => {
    const p = preview()
    p.renderState.setAsset({ ...p.asset, hasAnimation: true })
    p.renderState.render(p.scene, p.camera)
    p.renderState.setAsset(p.asset)
    p.renderState.render(p.scene, p.camera)
    p.renderState.render(p.scene, p.camera)
    expect(p.draws.map(draw => draw.shadowPass)).toEqual([true, true])
  })

  it('detaches its controls invalidation listener on cleanup', () => {
    const p = preview()
    p.renderState.render(p.scene, p.camera)
    p.renderState.dispose()
    p.controls.dispatchEvent({ type: 'change' })
    p.renderState.render(p.scene, p.camera)
    expect(p.draws).toHaveLength(1)
  })
})

describe('local preview thumbnail restoration', () => {
  it('forces thumbnail and restored-size frames even when the static preview is clean', async () => {
    const p = preview()
    p.renderState.render(p.scene, p.camera)
    const position = p.camera.position.clone()
    const target = p.controls.target.clone()
    const result = await captureLocalPreviewThumbnail(p, 128, 64)
    expect(result).toBe('data:image/png;base64,thumbnail')
    expect(p.draws.map(draw => [draw.width, draw.height, draw.shadowPass])).toEqual([
      [1600, 800, true], [128, 64, false], [1600, 800, false],
    ])
    expect(p.camera.position.distanceTo(position)).toBeLessThan(1e-10)
    expect(p.controls.target.distanceTo(target)).toBeLessThan(1e-10)
    expect(p.camera.aspect).toBe(2)
    expect(p.renderer.getPixelRatio()).toBe(2)
    p.renderState.render(p.scene, p.camera)
    expect(p.draws).toHaveLength(3)
  })

  it('restores and redraws the preview even if image capture fails', async () => {
    const p = preview()
    p.renderState.render(p.scene, p.camera)
    p.canvas.toDataURL = () => { throw new Error('capture failed') }
    await expect(captureLocalPreviewThumbnail(p, 256, 256)).rejects.toThrow('capture failed')
    expect(p.draws.map(draw => [draw.width, draw.height])).toEqual([[1600, 800], [256, 256], [1600, 800]])
    expect(p.camera.aspect).toBe(2)
    expect(p.renderer.getPixelRatio()).toBe(2)
  })
})
