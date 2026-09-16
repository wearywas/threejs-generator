const MAX_CANVAS_DIMENSION = 4096
const MAX_CANVAS_PIXELS = 16_000_000

/**
 * Allocate a bounded texture canvas in a Worker or on the main thread.
 * @param {number} width - Positive integer width in pixels (at most 4096)
 * @param {number} height - Positive integer height in pixels (at most 4096)
 * @returns {OffscreenCanvas|HTMLCanvasElement} Canvas with the requested dimensions
 * @throws {RangeError} If dimensions exceed the per-axis or 16M-pixel budget
 * @throws {Error} With code CANVAS_UNSUPPORTED if neither canvas API is available
 */
export function createCanvas(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 ||
      width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION ||
      width * height > MAX_CANVAS_PIXELS) {
    throw new RangeError('Canvas dimensions must be positive integers at most 4096 per axis and 16,000,000 pixels total')
  }

  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height)
  }

  if (typeof globalThis.document?.createElement === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  const error = new Error('Canvas is not supported: neither OffscreenCanvas nor document.createElement is available')
  error.code = 'CANVAS_UNSUPPORTED'
  throw error
}
