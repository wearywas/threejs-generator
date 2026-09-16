/**
 * Official Three.js Addons Registry
 * 
 * This module provides access to curated official Three.js addon modules
 * from three/examples/jsm/. All modules here are MIT-licensed and maintained
 * by the Three.js core team.
 */

import * as THREE from 'three'
import { createCanvas } from './canvas.js'

// Visual Effect Addons
import { Water } from 'three/examples/jsm/objects/Water.js'
import { Water as Water2 } from 'three/examples/jsm/objects/Water2.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'

// Utility Addons
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'

// Geometry Addons
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'

// Default textures
import { createWaterNormalsTexture } from '../assets/waterNormals.js'

/**
 * Create the addons object with all supported modules and default textures
 */
function createAddons() {
  // Create default water normals texture
  const waterNormals = createWaterNormalsTexture()
  
  return {
    // ==========================================
    // Visual Effect Classes
    // ==========================================
    
    /**
     * Water - Ocean/lake surfaces with reflections and waves
     * Usage: new addons.Water(geometry, options)
     * 
     * Options:
     * - textureWidth: number (default 512)
     * - textureHeight: number (default 512)
     * - waterNormals: THREE.Texture (use addons.textures.waterNormals)
     * - sunDirection: THREE.Vector3
     * - sunColor: hex color
     * - waterColor: hex color
     * - distortionScale: number
     * - fog: boolean
     */
    Water,
    
    /**
     * Water2 - Flow-map based water for rivers and streams
     * Usage: new addons.Water2(geometry, options)
     * 
     * Options:
     * - color: hex color
     * - scale: number
     * - flowDirection: THREE.Vector2
     * - textureWidth: number
     * - textureHeight: number
     */
    Water2,
    
    /**
     * Sky - Procedural sky dome with atmospheric scattering
     * Usage: const sky = new addons.Sky()
     * 
     * Uniforms to set:
     * - sky.material.uniforms.turbidity.value = 10
     * - sky.material.uniforms.rayleigh.value = 2
     * - sky.material.uniforms.mieCoefficient.value = 0.005
     * - sky.material.uniforms.mieDirectionalG.value = 0.8
     * - sky.material.uniforms.sunPosition.value = new THREE.Vector3(...)
     */
    Sky,
    
    /**
     * Reflector - Mirror/reflective floor surfaces
     * Usage: new addons.Reflector(geometry, options)
     * 
     * Options:
     * - color: hex color
     * - textureWidth: number
     * - textureHeight: number
     * - clipBias: number
     */
    Reflector,
    
    // ==========================================
    // Utility Classes
    // ==========================================
    
    /**
     * SimplexNoise - Better procedural noise for terrain, clouds, etc.
     * Usage: 
     *   const simplex = new addons.SimplexNoise()
     *   const value = simplex.noise(x, y) // 2D noise
     *   const value3d = simplex.noise3d(x, y, z) // 3D noise
     *   const value4d = simplex.noise4d(x, y, z, w) // 4D noise
     */
    SimplexNoise,
    
    // ==========================================
    // Geometry Classes
    // ==========================================
    
    /**
     * ConvexGeometry - Creates a convex hull from a set of points
     * ESSENTIAL for creating proper watertight rock/boulder meshes!
     * Usage:
     *   const points = [new THREE.Vector3(...), ...]
     *   const geometry = new addons.ConvexGeometry(points)
     * 
     * Why use this for rocks:
     * - Creates a proper closed mesh from any point cloud
     * - No broken faces or gaps
     * - Perfect for organic shapes like rocks, crystals, asteroids
     */
    ConvexGeometry,
    
    // ==========================================
    // Material Presets
    // ==========================================
    
    materials: {
      /**
       * Low-poly flat shaded material - classic stylized look
       * @param {number|string} color - Base color (hex or CSS color)
       * @param {object} options - { side, transparent, opacity }
       */
      lowpolyFlat(color, options = {}) {
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: 1.0,
          metalness: 0,
          flatShading: true,
          side: options.side || THREE.FrontSide,
          transparent: options.transparent || false,
          opacity: options.opacity ?? 1.0
        })
      },
      
      /**
       * Stylized PBR material - subtle realism with artistic control
       * @param {number|string} color - Base color
       * @param {object} options - { roughness, metalness, flatShading }
       */
      stylizedPBR(color, options = {}) {
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: options.roughness ?? 0.7,
          metalness: options.metalness ?? 0.1,
          flatShading: options.flatShading ?? false,
          side: options.side || THREE.FrontSide
        })
      },
      
      /**
       * Toon/cel-shaded material - cartoon look with hard lighting bands
       * @param {number|string} color - Base color
       * @param {object} options - { steps } - number of shading steps
       */
      toon(color, options = {}) {
        // Create a gradient map for toon shading
        const steps = options.steps || 4
        const canvas = createCanvas(steps, 1)
        const ctx = canvas.getContext('2d')
        
        for (let i = 0; i < steps; i++) {
          const value = Math.floor((i / (steps - 1)) * 255)
          ctx.fillStyle = `rgb(${value},${value},${value})`
          ctx.fillRect(i, 0, 1, 1)
        }
        
        const gradientMap = new THREE.CanvasTexture(canvas)
        gradientMap.minFilter = THREE.NearestFilter
        gradientMap.magFilter = THREE.NearestFilter
        
        return new THREE.MeshToonMaterial({
          color: new THREE.Color(color),
          gradientMap: gradientMap
        })
      },
      
      /**
       * Clay/matte material - soft, diffuse look like unfired clay
       * @param {number|string} color - Base color
       * @param {object} options - { roughness }
       */
      clay(color, options = {}) {
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: options.roughness ?? 0.95,
          metalness: 0,
          flatShading: false
        })
      },
      
      /**
       * Metallic material - shiny metal surfaces
       * @param {number|string} color - Base color
       * @param {object} options - { roughness, metalness }
       */
      metallic(color, options = {}) {
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: options.roughness ?? 0.3,
          metalness: options.metalness ?? 0.9,
          flatShading: false
        })
      },
      
      /**
       * Emissive/glowing material - for lights, magic effects, etc.
       * @param {number|string} color - Emissive color
       * @param {object} options - { intensity }
       */
      emissive(color, options = {}) {
        const c = new THREE.Color(color)
        return new THREE.MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: options.intensity ?? 1.0,
          roughness: 0.5,
          metalness: 0
        })
      },
      
      /**
       * Glass/transparent material - windows, water drops, crystals
       * @param {number|string} color - Tint color
       * @param {object} options - { opacity, roughness }
       */
      glass(color, options = {}) {
        return new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(color),
          roughness: options.roughness ?? 0.1,
          metalness: 0,
          transmission: options.transmission ?? 0.9,
          transparent: true,
          opacity: options.opacity ?? 0.5,
          side: THREE.DoubleSide
        })
      }
    },
    
    // ==========================================
    // Default & Procedural Textures
    // ==========================================
    
    textures: {
      /**
       * Pre-generated water normal map texture
       * Use with addons.Water for realistic wave effects
       */
      waterNormals,
      
      /**
       * Create a custom canvas texture with a drawing function
       * LLMs can write the drawFn to create any pattern!
       * @param {number} width - Texture width
       * @param {number} height - Texture height  
       * @param {function} drawFn - Function(ctx, width, height) that draws on the canvas
       * @returns {THREE.CanvasTexture}
       */
      createCanvasTexture(width, height, drawFn) {
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        
        // Execute the drawing function
        drawFn(ctx, width, height)
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true
        return texture
      },
      
      /**
       * Generate a Perlin-like noise texture
       * @param {object} options - { width, height, scale, octaves, baseColor, noiseColor }
       */
      makeNoise(options = {}) {
        const width = options.width || 256
        const height = options.height || 256
        const scale = options.scale || 50
        const octaves = options.octaves || 4
        const baseColor = options.baseColor ? new THREE.Color(options.baseColor) : new THREE.Color(0x888888)
        const noiseColor = options.noiseColor ? new THREE.Color(options.noiseColor) : new THREE.Color(0x444444)
        
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        const imageData = ctx.createImageData(width, height)
        
        // Simple noise function using sine waves (approximates Perlin)
        function noise2D(x, y) {
          let value = 0
          let amplitude = 1
          let frequency = 1
          let maxValue = 0
          
          for (let o = 0; o < octaves; o++) {
            value += amplitude * (
              Math.sin(x * frequency * 0.1 + y * frequency * 0.07) * 0.5 +
              Math.sin(x * frequency * 0.13 - y * frequency * 0.11) * 0.3 +
              Math.sin((x + y) * frequency * 0.09) * 0.2
            )
            maxValue += amplitude
            amplitude *= 0.5
            frequency *= 2
          }
          
          return (value / maxValue + 1) / 2 // Normalize to 0-1
        }
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const n = noise2D(x / scale, y / scale)
            const r = Math.floor(baseColor.r * 255 * (1 - n) + noiseColor.r * 255 * n)
            const g = Math.floor(baseColor.g * 255 * (1 - n) + noiseColor.g * 255 * n)
            const b = Math.floor(baseColor.b * 255 * (1 - n) + noiseColor.b * 255 * n)
            
            const i = (y * width + x) * 4
            imageData.data[i] = r
            imageData.data[i + 1] = g
            imageData.data[i + 2] = b
            imageData.data[i + 3] = 255
          }
        }
        
        ctx.putImageData(imageData, 0, 0)
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        return texture
      },
      
      /**
       * Generate a speckled texture (granite, stone, concrete)
       * @param {object} options - { width, height, density, baseColor, speckleColors }
       */
      makeSpeckle(options = {}) {
        const width = options.width || 256
        const height = options.height || 256
        const density = options.density || 0.3
        const baseColor = options.baseColor || '#808080'
        const speckleColors = options.speckleColors || ['#606060', '#a0a0a0', '#707070']
        
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        
        // Fill with base color
        ctx.fillStyle = baseColor
        ctx.fillRect(0, 0, width, height)
        
        // Add speckles
        const speckleCount = Math.floor(width * height * density)
        for (let i = 0; i < speckleCount; i++) {
          const x = Math.random() * width
          const y = Math.random() * height
          const size = Math.random() * 3 + 1
          const color = speckleColors[Math.floor(Math.random() * speckleColors.length)]
          
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.fill()
        }
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        return texture
      },
      
      /**
       * Generate a wood grain texture
       * @param {object} options - { width, height, baseColor, ringColor, ringCount, scale }
       */
      makeWoodGrain(options = {}) {
        const width = options.width || 256
        const height = options.height || 256
        const baseColor = options.baseColor || '#8B4513'
        const ringColor = options.ringColor || '#654321'
        const ringCount = options.ringCount || 20
        const scale = options.scale || 1
        
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        
        const base = new THREE.Color(baseColor)
        const ring = new THREE.Color(ringColor)
        
        // Create wood ring pattern
        const imageData = ctx.createImageData(width, height)
        const centerX = width / 2
        const centerY = height * 2 // Center below the texture for elongated grain
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const dx = (x - centerX) * scale
            const dy = (y - centerY) * scale * 0.3 // Stretch vertically
            const dist = Math.sqrt(dx * dx + dy * dy)
            
            // Create ring pattern with some noise
            const noise = Math.sin(x * 0.1) * 5 + Math.sin(y * 0.05) * 3
            const ringValue = Math.sin((dist + noise) / (width / ringCount) * Math.PI * 2)
            const t = (ringValue + 1) / 2
            
            const r = Math.floor(base.r * 255 * t + ring.r * 255 * (1 - t))
            const g = Math.floor(base.g * 255 * t + ring.g * 255 * (1 - t))
            const b = Math.floor(base.b * 255 * t + ring.b * 255 * (1 - t))
            
            const i = (y * width + x) * 4
            imageData.data[i] = r
            imageData.data[i + 1] = g
            imageData.data[i + 2] = b
            imageData.data[i + 3] = 255
          }
        }
        
        ctx.putImageData(imageData, 0, 0)
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        return texture
      },
      
      /**
       * Generate a brick/tile pattern texture
       * @param {object} options - { width, height, brickColor, mortarColor, brickWidth, brickHeight, mortarSize }
       */
      makeBrick(options = {}) {
        const width = options.width || 256
        const height = options.height || 256
        const brickColor = options.brickColor || '#8B4513'
        const mortarColor = options.mortarColor || '#808080'
        const brickWidth = options.brickWidth || 64
        const brickHeight = options.brickHeight || 32
        const mortarSize = options.mortarSize || 4
        
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        
        // Fill with mortar color
        ctx.fillStyle = mortarColor
        ctx.fillRect(0, 0, width, height)
        
        // Draw bricks
        const baseColor = new THREE.Color(brickColor)
        
        for (let row = 0; row * (brickHeight + mortarSize) < height + brickHeight; row++) {
          const offsetX = (row % 2) * (brickWidth / 2) // Offset every other row
          
          for (let col = -1; col * (brickWidth + mortarSize) < width + brickWidth; col++) {
            const x = col * (brickWidth + mortarSize) + offsetX
            const y = row * (brickHeight + mortarSize)
            
            // Add slight color variation to each brick
            const variation = (Math.random() - 0.5) * 0.2
            const r = Math.min(255, Math.max(0, Math.floor(baseColor.r * 255 * (1 + variation))))
            const g = Math.min(255, Math.max(0, Math.floor(baseColor.g * 255 * (1 + variation))))
            const b = Math.min(255, Math.max(0, Math.floor(baseColor.b * 255 * (1 + variation))))
            
            ctx.fillStyle = `rgb(${r},${g},${b})`
            ctx.fillRect(x, y, brickWidth, brickHeight)
          }
        }
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        return texture
      },
      
      /**
       * Generate a gradient texture
       * @param {object} options - { width, height, colors, direction }
       */
      makeGradient(options = {}) {
        const width = options.width || 256
        const height = options.height || 256
        const colors = options.colors || ['#ff0000', '#0000ff']
        const direction = options.direction || 'vertical' // 'vertical', 'horizontal', 'radial'
        
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        
        let gradient
        if (direction === 'horizontal') {
          gradient = ctx.createLinearGradient(0, 0, width, 0)
        } else if (direction === 'radial') {
          gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2)
        } else {
          gradient = ctx.createLinearGradient(0, 0, 0, height)
        }
        
        colors.forEach((color, i) => {
          gradient.addColorStop(i / (colors.length - 1), color)
        })
        
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        return texture
      },
      
      /**
       * Generate a stripe pattern texture
       * @param {object} options - { width, height, color1, color2, stripeWidth, angle }
       */
      makeStripes(options = {}) {
        const width = options.width || 256
        const height = options.height || 256
        const color1 = options.color1 || '#ffffff'
        const color2 = options.color2 || '#ff0000'
        const stripeWidth = options.stripeWidth || 16
        const angle = options.angle || 0 // In degrees
        
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        
        // Fill background
        ctx.fillStyle = color1
        ctx.fillRect(0, 0, width, height)
        
        // Draw stripes with rotation
        ctx.save()
        ctx.translate(width / 2, height / 2)
        ctx.rotate(angle * Math.PI / 180)
        ctx.translate(-width, -height)
        
        ctx.fillStyle = color2
        const totalWidth = width * 3 // Cover rotated area
        for (let x = 0; x < totalWidth; x += stripeWidth * 2) {
          ctx.fillRect(x, -height, stripeWidth, height * 3)
        }
        
        ctx.restore()
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        return texture
      },
      
      /**
       * Generate a grass/foliage detail texture
       * @param {object} options - { width, height, baseColor, tipColor, bladeCount }
       */
      makeGrass(options = {}) {
        const width = options.width || 256
        const height = options.height || 256
        const baseColor = options.baseColor || '#2d5a27'
        const tipColor = options.tipColor || '#4a8c3f'
        const bladeCount = options.bladeCount || 200
        
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        
        // Transparent background
        ctx.clearRect(0, 0, width, height)
        
        // Draw grass blades
        for (let i = 0; i < bladeCount; i++) {
          const x = Math.random() * width
          const bladeHeight = 20 + Math.random() * 40
          const curve = (Math.random() - 0.5) * 20
          
          const gradient = ctx.createLinearGradient(x, height, x, height - bladeHeight)
          gradient.addColorStop(0, baseColor)
          gradient.addColorStop(1, tipColor)
          
          ctx.strokeStyle = gradient
          ctx.lineWidth = 1 + Math.random() * 2
          ctx.beginPath()
          ctx.moveTo(x, height)
          ctx.quadraticCurveTo(x + curve, height - bladeHeight / 2, x + curve * 1.5, height - bladeHeight)
          ctx.stroke()
        }
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        return texture
      },
      
      /**
       * Apply a texture to a material with real-world scaling
       * Automatically calculates repeat based on geometry size and desired texture scale
       * 
       * @param {THREE.Material} material - The material to apply texture to
       * @param {THREE.Texture} texture - The texture to apply
       * @param {number} geoWidth - Width of the geometry in world units
       * @param {number} geoHeight - Height of the geometry in world units
       * @param {object} options - { textureSize, mapType }
       *   - textureSize: Real-world size of one texture tile (default 1 = 1 meter)
       *   - mapType: 'map', 'bumpMap', 'normalMap', etc. (default 'map')
       * @returns {THREE.Texture} The configured texture
       */
      applyWithScale(material, texture, geoWidth, geoHeight, options = {}) {
        const textureSize = options.textureSize ?? 1  // 1 meter per tile by default
        const mapType = options.mapType || 'map'
        
        // Calculate how many times to repeat based on geometry size
        const repeatX = Math.max(1, Math.round(geoWidth / textureSize))
        const repeatY = Math.max(1, Math.round(geoHeight / textureSize))
        
        texture.repeat.set(repeatX, repeatY)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true
        
        // Apply to the specified map slot
        material[mapType] = texture
        material.needsUpdate = true
        
        return texture
      },
      
      /**
       * Create and apply a texture with scaling in one call
       * Convenience wrapper for common patterns
       * 
       * @param {THREE.Material} material - The material to apply texture to
       * @param {string} textureType - 'wood', 'brick', 'stone', 'noise', 'stripes'
       * @param {number} geoWidth - Width of the geometry
       * @param {number} geoHeight - Height of the geometry
       * @param {object} options - Texture options + { textureSize }
       */
      applyScaled(material, textureType, geoWidth, geoHeight, options = {}) {
        const textureSize = options.textureSize ?? 1
        let texture
        
        // Create the appropriate texture
        switch (textureType) {
          case 'wood':
            texture = this.makeWoodGrain(options)
            break
          case 'brick':
            texture = this.makeBrick(options)
            break
          case 'stone':
          case 'speckle':
            texture = this.makeSpeckle(options)
            break
          case 'noise':
            texture = this.makeNoise(options)
            break
          case 'stripes':
            texture = this.makeStripes(options)
            break
          case 'gradient':
            texture = this.makeGradient(options)
            break
          default:
            console.warn(`Unknown texture type: ${textureType}`)
            return null
        }
        
        // Apply with proper scaling
        return this.applyWithScale(material, texture, geoWidth, geoHeight, { 
          textureSize,
          mapType: options.mapType || 'map'
        })
      }
    },
    
    // ==========================================
    // Helper Functions
    // ==========================================
    
    /**
     * Create a basic sky setup with sun
     * @param {number} elevation - Sun elevation in degrees (0-90)
     * @param {number} azimuth - Sun azimuth in degrees (0-360)
     * @returns {object} { sky, sun } - Sky mesh and sun position vector
     */
    createSkyWithSun(elevation = 45, azimuth = 180) {
      const sky = new Sky()
      sky.scale.setScalar(10000)
      
      const sun = new THREE.Vector3()
      const phi = THREE.MathUtils.degToRad(90 - elevation)
      const theta = THREE.MathUtils.degToRad(azimuth)
      sun.setFromSphericalCoords(1, phi, theta)
      
      sky.material.uniforms.sunPosition.value.copy(sun)
      sky.material.uniforms.turbidity.value = 10
      sky.material.uniforms.rayleigh.value = 2
      sky.material.uniforms.mieCoefficient.value = 0.005
      sky.material.uniforms.mieDirectionalG.value = 0.8
      
      return { sky, sun }
    },
    
    /**
     * Create a basic water plane with default settings
     * @param {number} width - Water plane width
     * @param {number} height - Water plane height
     * @param {object} options - Additional water options
     * @returns {Water} Configured water mesh
     */
    createWaterPlane(width = 100, height = 100, options = {}) {
      const geometry = new THREE.PlaneGeometry(width, height)
      
      const water = new Water(geometry, {
        textureWidth: options.textureWidth || 512,
        textureHeight: options.textureHeight || 512,
        waterNormals: waterNormals,
        sunDirection: options.sunDirection || new THREE.Vector3(1, 1, 0).normalize(),
        sunColor: options.sunColor || 0xffffff,
        waterColor: options.waterColor || 0x001e0f,
        distortionScale: options.distortionScale || 3.7,
        fog: options.fog !== undefined ? options.fog : false
      })
      
      water.rotation.x = -Math.PI / 2
      
      return water
    }
  }
}

// Create and export the singleton addons object
export const ADDONS = createAddons()

// Also export individual modules for direct import if needed
export { Water, Water2, Sky, Reflector, SimplexNoise, ConvexGeometry }
