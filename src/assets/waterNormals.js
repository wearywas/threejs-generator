/**
 * Procedurally Generated Water Normals Texture
 * 
 * Creates a seamless normal map for water wave effects.
 * This eliminates the need for external texture files while
 * providing good visual quality for the Water addon.
 */

import * as THREE from 'three'
import { createCanvas } from '../runtime/canvas.js'

function createNormalCanvas(size) {
  try {
    return createCanvas(size, size)
  } catch (error) {
    // Only missing platform APIs get flat normals; invalid sizes and allocation
    // failures must propagate instead of silently losing procedural detail.
    if (error?.code !== 'CANVAS_UNSUPPORTED') throw error
    return null
  }
}

function createFallbackNormalTexture(size, repeat = 4) {
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128
    data[i + 1] = 128
    data[i + 2] = 255
    data[i + 3] = 255
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.needsUpdate = true
  return texture
}

/**
 * Generate a seamless Perlin-like noise value
 */
function noise2D(x, y, seed = 0) {
  // Simple hash function
  const hash = (n) => {
    let h = (n * 127.1 + seed) * 311.7
    return h - Math.floor(h)
  }
  
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  
  // Smoothstep
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  
  // Hash corners
  const a = hash(ix + iy * 57)
  const b = hash(ix + 1 + iy * 57)
  const c = hash(ix + (iy + 1) * 57)
  const d = hash(ix + 1 + (iy + 1) * 57)
  
  // Bilinear interpolation
  return a * (1 - ux) * (1 - uy) + 
         b * ux * (1 - uy) + 
         c * (1 - ux) * uy + 
         d * ux * uy
}

/**
 * Generate fractal Brownian motion noise (multi-octave)
 */
function fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2) {
  let value = 0
  let amplitude = 1
  let frequency = 1
  let maxValue = 0
  
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency, i * 100)
    maxValue += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }
  
  return value / maxValue
}

/**
 * Create a procedural water normals texture
 * @param {number} size - Texture size (power of 2 recommended)
 * @returns {THREE.Texture} Water normals texture
 */
export function createWaterNormalsTexture(size = 256) {
  const canvas = createNormalCanvas(size)
  if (!canvas) {
    return createFallbackNormalTexture(size, 4)
  }

  const ctx = canvas.getContext('2d')
  
  // Create image data
  const imageData = ctx.createImageData(size, size)
  const data = imageData.data
  
  // Generate normal map from height field
  const heightField = new Float32Array(size * size)
  
  // Generate seamless height field using multiple noise octaves
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Normalize coordinates for seamless tiling
      const nx = x / size
      const ny = y / size
      
      // Create seamless noise by blending at edges
      // Use toroidal mapping for perfect tiling
      const scale1 = 4
      const scale2 = 8
      const scale3 = 16
      
      // Multiple wave frequencies
      let height = 0
      
      // Large waves
      height += 0.5 * fbm(nx * scale1, ny * scale1, 3)
      
      // Medium waves
      height += 0.3 * fbm(nx * scale2 + 100, ny * scale2 + 100, 4)
      
      // Small ripples
      height += 0.2 * fbm(nx * scale3 + 200, ny * scale3 + 200, 2)
      
      heightField[y * size + x] = height
    }
  }
  
  // Convert height field to normal map
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      
      // Sample neighboring heights with wrapping for seamless edges
      const left = heightField[y * size + ((x - 1 + size) % size)]
      const right = heightField[y * size + ((x + 1) % size)]
      const top = heightField[((y - 1 + size) % size) * size + x]
      const bottom = heightField[((y + 1) % size) * size + x]
      
      // Calculate normal from height differences
      const strength = 2.0 // Normal map strength
      const dx = (left - right) * strength
      const dy = (top - bottom) * strength
      
      // Normalize the normal vector
      const len = Math.sqrt(dx * dx + dy * dy + 1)
      const nx = dx / len
      const ny = dy / len
      const nz = 1 / len
      
      // Convert to RGB (normal maps use 0-255 range, centered at 128)
      data[idx] = Math.floor((nx * 0.5 + 0.5) * 255)     // R
      data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255) // G
      data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255) // B
      data[idx + 3] = 255                                 // A
    }
  }
  
  ctx.putImageData(imageData, 0, 0)
  
  // Create Three.js texture from canvas
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4, 4)
  texture.needsUpdate = true
  
  return texture
}

/**
 * Create a more detailed water normals texture using Worley noise
 * This creates a cellular/caustic-like pattern
 * @param {number} size - Texture size
 * @returns {THREE.Texture}
 */
export function createCausticNormalsTexture(size = 256) {
  const canvas = createNormalCanvas(size)
  if (!canvas) {
    return createFallbackNormalTexture(size, 2)
  }

  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(size, size)
  const data = imageData.data
  
  // Generate random cell points
  const numCells = 16
  const cells = []
  for (let i = 0; i < numCells; i++) {
    cells.push({
      x: Math.random(),
      y: Math.random()
    })
  }
  
  // Height field from Worley noise
  const heightField = new Float32Array(size * size)
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size
      const ny = y / size
      
      // Find distance to nearest cell (with wrapping)
      let minDist = Infinity
      let secondMinDist = Infinity
      
      for (const cell of cells) {
        // Check wrapped distances for seamless tiling
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const dx = nx - (cell.x + ox)
            const dy = ny - (cell.y + oy)
            const dist = Math.sqrt(dx * dx + dy * dy)
            
            if (dist < minDist) {
              secondMinDist = minDist
              minDist = dist
            } else if (dist < secondMinDist) {
              secondMinDist = dist
            }
          }
        }
      }
      
      // Use F2-F1 for caustic-like pattern
      const height = secondMinDist - minDist
      
      // Add some noise
      const detail = 0.1 * fbm(nx * 8, ny * 8, 2)
      
      heightField[y * size + x] = height + detail
    }
  }
  
  // Normalize height field
  let minH = Infinity, maxH = -Infinity
  for (let i = 0; i < heightField.length; i++) {
    minH = Math.min(minH, heightField[i])
    maxH = Math.max(maxH, heightField[i])
  }
  for (let i = 0; i < heightField.length; i++) {
    heightField[i] = (heightField[i] - minH) / (maxH - minH)
  }
  
  // Convert to normal map
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      
      const left = heightField[y * size + ((x - 1 + size) % size)]
      const right = heightField[y * size + ((x + 1) % size)]
      const top = heightField[((y - 1 + size) % size) * size + x]
      const bottom = heightField[((y + 1) % size) * size + x]
      
      const strength = 3.0
      const dx = (left - right) * strength
      const dy = (top - bottom) * strength
      
      const len = Math.sqrt(dx * dx + dy * dy + 1)
      const nx2 = dx / len
      const ny2 = dy / len
      const nz = 1 / len
      
      data[idx] = Math.floor((nx2 * 0.5 + 0.5) * 255)
      data[idx + 1] = Math.floor((ny2 * 0.5 + 0.5) * 255)
      data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255)
      data[idx + 3] = 255
    }
  }
  
  ctx.putImageData(imageData, 0, 0)
  
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  texture.needsUpdate = true
  
  return texture
}
