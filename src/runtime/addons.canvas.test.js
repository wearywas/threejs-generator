import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createCausticNormalsTexture, createWaterNormalsTexture } from '../assets/waterNormals.js'

// Only the platform canvas boundary is faked; texture construction and drawing
// algorithms run unchanged, including the generated normal-map pixel buffers.
class TestCanvas {
  constructor(width, height) {
    this.width = width
    this.height = height
    this.operations = []
    this.context = {
      canvas: this,
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (imageData, x, y) => {
        this.imageData = imageData
        this.operations.push(['putImageData', x, y])
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    }
    for (const method of ['fillRect', 'clearRect', 'beginPath', 'arc', 'fill',
      'save', 'translate', 'rotate', 'restore', 'moveTo', 'quadraticCurveTo', 'stroke']) {
      this.context[method] = (...args) => this.operations.push([method, ...args])
    }
  }

  getContext(type) {
    if (type !== '2d') throw new Error('Expected a 2D texture canvas')
    return this.context
  }
}

beforeEach(() => {
  vi.stubGlobal('document', undefined)
  vi.stubGlobal('OffscreenCanvas', TestCanvas)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('procedural normals without a document', () => {
  it.each([
    ['water', createWaterNormalsTexture],
    ['caustic', createCausticNormalsTexture],
  ])('rejects unsafe %s sizes even on the Node fallback path', (_, createTexture) => {
    vi.stubGlobal('OffscreenCanvas', undefined)

    for (const size of [0, -1, 1.5, NaN, '16', 4001]) {
      expect(() => createTexture(size)).toThrow(RangeError)
    }
  })

  it('does not turn an OffscreenCanvas allocation failure into flat normals', () => {
    vi.stubGlobal('OffscreenCanvas', class {
      constructor() { throw new Error('Allocation failed') }
    })

    expect(() => createWaterNormalsTexture(16)).toThrow('Allocation failed')
    expect(() => createCausticNormalsTexture(16)).toThrow('Allocation failed')
  })

  it.each([
    ['water', createWaterNormalsTexture, 4],
    ['caustic', createCausticNormalsTexture, 2],
  ])('generates non-flat %s normals on OffscreenCanvas', (_, createTexture, repeat) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25)

    const texture = createTexture(16)

    expect(texture.isCanvasTexture).toBe(true)
    expect(texture.image).toBeInstanceOf(TestCanvas)
    expect([texture.image.width, texture.image.height]).toEqual([16, 16])
    expect(texture.wrapS).toBe(THREE.RepeatWrapping)
    expect(texture.wrapT).toBe(THREE.RepeatWrapping)
    expect(texture.repeat.toArray()).toEqual([repeat, repeat])
    expect(texture.version).toBeGreaterThan(0)
    const pixels = texture.image.imageData.data
    const red = []
    const green = []
    for (let i = 0; i < pixels.length; i += 4) {
      red.push(pixels[i])
      green.push(pixels[i + 1])
      expect(pixels[i + 3]).toBe(255)
    }
    expect(new Set(red).size).toBeGreaterThan(1)
    expect(new Set(green).size).toBeGreaterThan(1)
    texture.dispose()
  })

  it.each([
    ['water', createWaterNormalsTexture, 4],
    ['caustic', createCausticNormalsTexture, 2],
  ])('keeps a safe %s DataTexture fallback without any canvas API', (_, createTexture, repeat) => {
    vi.stubGlobal('OffscreenCanvas', undefined)

    const texture = createTexture(2)

    expect(texture.isDataTexture).toBe(true)
    expect([texture.image.width, texture.image.height]).toEqual([2, 2])
    expect(Array.from(texture.image.data)).toEqual([
      128, 128, 255, 255, 128, 128, 255, 255,
      128, 128, 255, 255, 128, 128, 255, 255,
    ])
    expect(texture.repeat.toArray()).toEqual([repeat, repeat])
    expect(texture.wrapS).toBe(THREE.RepeatWrapping)
    expect(texture.wrapT).toBe(THREE.RepeatWrapping)
    expect(texture.version).toBeGreaterThan(0)
    texture.dispose()
  })
})

describe('worker-compatible addon textures', () => {
  it('initializes procedural default water normals in a Worker', async () => {
    const { ADDONS } = await import('./addons.js')

    expect(ADDONS.textures.waterNormals.isCanvasTexture).toBe(true)
    expect([ADDONS.textures.waterNormals.image.width, ADDONS.textures.waterNormals.image.height])
      .toEqual([256, 256])
    expect(ADDONS.textures.waterNormals.image.imageData.data.length).toBe(256 * 256 * 4)
    ADDONS.textures.waterNormals.dispose()
  })

  it('remains importable in Node without canvas APIs', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    const { ADDONS } = await import('./addons.js')

    expect(ADDONS.textures.waterNormals.isDataTexture).toBe(true)
    expect([ADDONS.textures.waterNormals.image.width, ADDONS.textures.waterNormals.image.height])
      .toEqual([256, 256])
    ADDONS.textures.waterNormals.dispose()
  })

  it('passes the sized 2D canvas to custom drawing code', async () => {
    const { ADDONS } = await import('./addons.js')
    const texture = ADDONS.textures.createCanvasTexture(12, 8, (ctx, width, height) => {
      ctx.fillRect(0, 0, width, height)
    })

    expect(texture.isCanvasTexture).toBe(true)
    expect([texture.image.width, texture.image.height]).toEqual([12, 8])
    expect(texture.image.operations).toEqual([['fillRect', 0, 0, 12, 8]])
    expect(texture.wrapS).toBe(THREE.RepeatWrapping)
    expect(texture.wrapT).toBe(THREE.RepeatWrapping)
    texture.dispose()
    ADDONS.textures.waterNormals.dispose()
  })

  it.each(['makeNoise', 'makeSpeckle', 'makeWoodGrain', 'makeBrick',
    'makeGradient', 'makeStripes', 'makeGrass'])('%s draws a sized texture in a Worker', async name => {
    const { ADDONS } = await import('./addons.js')
    const texture = ADDONS.textures[name]({ width: 16, height: 8 })

    expect(texture.isCanvasTexture).toBe(true)
    expect(texture.image).toBeInstanceOf(TestCanvas)
    expect([texture.image.width, texture.image.height]).toEqual([16, 8])
    expect(texture.image.operations.length).toBeGreaterThan(0)
    expect(texture.wrapS).toBe(THREE.RepeatWrapping)
    expect(texture.wrapT).toBe(THREE.RepeatWrapping)
    texture.dispose()
    ADDONS.textures.waterNormals.dispose()
  })

  it('creates the toon gradient map in a Worker', async () => {
    const { ADDONS } = await import('./addons.js')
    const material = ADDONS.materials.toon(0xffffff, { steps: 5 })

    expect(material.isMeshToonMaterial).toBe(true)
    expect(material.gradientMap.isCanvasTexture).toBe(true)
    expect([material.gradientMap.image.width, material.gradientMap.image.height]).toEqual([5, 1])
    expect(material.gradientMap.image.operations).toEqual([
      ['fillRect', 0, 0, 1, 1], ['fillRect', 1, 0, 1, 1], ['fillRect', 2, 0, 1, 1],
      ['fillRect', 3, 0, 1, 1], ['fillRect', 4, 0, 1, 1],
    ])
    expect(material.gradientMap.minFilter).toBe(THREE.NearestFilter)
    expect(material.gradientMap.magFilter).toBe(THREE.NearestFilter)
    material.gradientMap.dispose()
    material.dispose()
    ADDONS.textures.waterNormals.dispose()
  })
})
