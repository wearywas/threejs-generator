import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCanvas } from './canvas.js'

class TestOffscreenCanvas {
  constructor(width, height) {
    this.width = width
    this.height = height
  }
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', TestOffscreenCanvas)
  vi.stubGlobal('document', undefined)
})

afterEach(() => vi.unstubAllGlobals())

describe('createCanvas', () => {
  it('creates an OffscreenCanvas with the requested dimensions without a document', () => {
    const canvas = createCanvas(32, 16)

    expect(canvas).toBeInstanceOf(TestOffscreenCanvas)
    expect([canvas.width, canvas.height]).toEqual([32, 16])
  })

  it('prefers OffscreenCanvas when both APIs exist', () => {
    vi.stubGlobal('document', {
      createElement() { throw new Error('Must not allocate a DOM canvas') },
    })

    expect(createCanvas(8, 4)).toBeInstanceOf(TestOffscreenCanvas)
  })

  it('sizes a document canvas when OffscreenCanvas is unavailable', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    vi.stubGlobal('document', {
      createElement(tag) {
        if (tag !== 'canvas') throw new Error('Expected a canvas element')
        return { width: 300, height: 150, tagName: 'CANVAS' }
      },
    })

    expect(createCanvas(20, 12)).toEqual({ width: 20, height: 12, tagName: 'CANVAS' })
  })

  it.each([undefined, null, {}, { createElement: true }])(
    'reports unsupported canvas APIs clearly with document=%j', document => {
      vi.stubGlobal('OffscreenCanvas', undefined)
      vi.stubGlobal('document', document)

      expect(() => createCanvas(8, 8)).toThrow(/canvas.*(unavailable|unsupported|not supported)/i)
    },
  )

  it.each([[1, 1], [4096, 1], [1, 4096], [4000, 4000]])(
    'accepts safe boundary dimensions %i x %i', (width, height) => {
      const canvas = createCanvas(width, height)

      expect([canvas.width, canvas.height]).toEqual([width, height])
    },
  )

  it.each([
    [0, 1], [1, 0], [-1, 1], [1, -1], [0.5, 1], [1, 1.5],
    [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
    ['32', 16], [16, '32'], [null, 1], [1, undefined], [true, 1],
    [Number.MAX_SAFE_INTEGER + 1, 1], [4097, 1], [1, 4097], [4001, 4000],
  ])('rejects unsafe dimensions %s x %s before allocating', (width, height) => {
    vi.stubGlobal('OffscreenCanvas', class {
      constructor() { throw new Error('Must validate before allocation') }
    })
    vi.stubGlobal('document', {
      createElement() { throw new Error('Must validate before allocation') },
    })

    expect(() => createCanvas(width, height)).toThrow(RangeError)
  })

  it('validates dimensions even without canvas APIs', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)

    expect(() => createCanvas(4097, 1)).toThrow(RangeError)
  })

  it('does not hide an OffscreenCanvas allocation failure behind DOM fallback', () => {
    vi.stubGlobal('OffscreenCanvas', class {
      constructor() { throw new Error('Allocation failed') }
    })
    vi.stubGlobal('document', { createElement: () => ({}) })

    expect(() => createCanvas(16, 16)).toThrow('Allocation failed')
  })
})
