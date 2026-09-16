/**
 * Environment Scatter Generator
 * Uses Poisson Disc Sampling for natural-looking prop placement
 */
import * as THREE from 'three'
import { createRNG } from '../runtime/seedRandom'
import { createInstancedFromTemplate } from './modules/instancingUtils'
import { createEnvironmentKitLibrary } from './environmentKits'
import { createAssetDisposer, disposeObject } from '../runtime/assetDisposal'

/**
 * Poisson Disc Sampling for natural spacing
 * Prevents props from overlapping while maintaining organic look
 * 
 * @param {Object} config
 * @param {number} config.width - Area width
 * @param {number} config.height - Area height (depth)
 * @param {number} config.minDistance - Minimum distance between points
 * @param {number} config.maxAttempts - Max attempts per point (default 30)
 * @param {Function} config.random - Random function
 * @returns {Array<{x: number, y: number}>} Array of 2D positions
 */
export function poissonDiscSampling(config) {
  const {
    width,
    height,
    minDistance,
    maxAttempts = 30,
    random
  } = config

  const cellSize = minDistance / Math.sqrt(2)
  const gridWidth = Math.ceil(width / cellSize)
  const gridHeight = Math.ceil(height / cellSize)
  
  const grid = new Array(gridWidth * gridHeight).fill(null)
  const points = []
  const active = []

  // Helper to get grid index
  const gridIndex = (x, y) => {
    const gx = Math.floor(x / cellSize)
    const gy = Math.floor(y / cellSize)
    if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return -1
    return gy * gridWidth + gx
  }

  // Check if point is valid (far enough from neighbors)
  const isValid = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    
    const gx = Math.floor(x / cellSize)
    const gy = Math.floor(y / cellSize)
    
    // Check 5x5 neighborhood
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = gx + dx
        const ny = gy + dy
        
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
          const idx = ny * gridWidth + nx
          const neighbor = grid[idx]
          
          if (neighbor) {
            const dist = Math.sqrt(
              (neighbor.x - x) * (neighbor.x - x) +
              (neighbor.y - y) * (neighbor.y - y)
            )
            if (dist < minDistance) return false
          }
        }
      }
    }
    
    return true
  }

  // Start with random first point
  const firstX = random() * width
  const firstY = random() * height
  const firstPoint = { x: firstX, y: firstY }
  
  points.push(firstPoint)
  active.push(firstPoint)
  
  const idx = gridIndex(firstX, firstY)
  if (idx >= 0) grid[idx] = firstPoint

  // Generate more points
  while (active.length > 0) {
    const activeIdx = Math.floor(random() * active.length)
    const point = active[activeIdx]
    let found = false
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = random() * Math.PI * 2
      const distance = minDistance + random() * minDistance
      
      const newX = point.x + Math.cos(angle) * distance
      const newY = point.y + Math.sin(angle) * distance
      
      if (isValid(newX, newY)) {
        const newPoint = { x: newX, y: newY }
        points.push(newPoint)
        active.push(newPoint)
        
        const newIdx = gridIndex(newX, newY)
        if (newIdx >= 0) grid[newIdx] = newPoint
        
        found = true
        break
      }
    }
    
    if (!found) {
      active.splice(activeIdx, 1)
    }
  }
  
  return points
}

/**
 * Generate a simple noise map for density filtering
 * 
 * @param {number} size - Map size
 * @param {number} seed - Random seed
 * @param {number} scale - Noise scale (larger = smoother)
 * @returns {Float32Array} Noise values 0-1
 */
export function generateNoiseMap(size, seed, scale = 0.1) {
  const rng = createRNG(seed)
  const map = new Float32Array(size * size)
  
  // Simple value noise with interpolation
  const gridSize = Math.max(4, Math.floor(size * scale))
  const grid = []
  
  for (let y = 0; y <= gridSize; y++) {
    grid[y] = []
    for (let x = 0; x <= gridSize; x++) {
      grid[y][x] = rng.random()
    }
  }
  
  // Interpolate
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * gridSize
      const gy = (y / size) * gridSize
      
      const x0 = Math.floor(gx)
      const x1 = Math.min(x0 + 1, gridSize)
      const y0 = Math.floor(gy)
      const y1 = Math.min(y0 + 1, gridSize)
      
      const fx = gx - x0
      const fy = gy - y0
      
      // Bilinear interpolation
      const v00 = grid[y0][x0]
      const v10 = grid[y0][x1]
      const v01 = grid[y1][x0]
      const v11 = grid[y1][x1]
      
      const v0 = v00 * (1 - fx) + v10 * fx
      const v1 = v01 * (1 - fx) + v11 * fx
      const value = v0 * (1 - fy) + v1 * fy
      
      map[y * size + x] = value
    }
  }
  
  return map
}

/**
 * Sample noise map at a position
 */
export function sampleNoiseMap(map, x, y, size) {
  const mapSize = Math.sqrt(map.length)
  const mx = Math.floor((x / size) * mapSize)
  const my = Math.floor((y / size) * mapSize)
  
  const idx = Math.max(0, Math.min(map.length - 1, my * mapSize + mx))
  return map[idx]
}

/**
 * Create environment scatter
 * 
 * @param {Object} params - Scatter parameters
 * @param {number} seed - Random seed
 * @param {Object} textures - Optional textures (unused)
 * @param {Object} addons - Addon modules
 * @returns {{root: THREE.Group, update: Function|null, dispose: Function}}
 */
export function createEnvironmentScatter(params, seed, textures = {}, addons = null) {
  const {
    area = 20,
    propType = 'tree',
    density = 0.5,
    minDistance = 2,
    clearingRadius = 0,
    clearingCenter = { x: 0, z: 0 },
    scaleVariation = 0.3,
    colorVariation = 0.1
  } = params

  const rng = createRNG(seed)
  const group = new THREE.Group()
  group.name = 'environmentScatter'
  // Symmetric around one, with a nonzero lower bound even at maximum variation.
  const scaleSpread = THREE.MathUtils.clamp(scaleVariation, 0, 0.95)
  const nextScale = () => 1 + (rng.random() * 2 - 1) * scaleSpread
  
  // Generate density noise map
  const noiseMapSize = 64
  const noiseMap = generateNoiseMap(noiseMapSize, seed, 0.15)
  
  // Generate points using Poisson disc sampling
  const points = poissonDiscSampling({
    width: area,
    height: area,
    minDistance,
    maxAttempts: 30,
    random: () => rng.random()
  })
  
  // Filter points based on density and clearing
  const filteredPoints = points.filter(p => {
    // Check clearing
    if (clearingRadius > 0) {
      const dx = p.x - area / 2 - clearingCenter.x
      const dy = p.y - area / 2 - clearingCenter.z
      if (Math.sqrt(dx * dx + dy * dy) < clearingRadius) {
        return false
      }
    }
    
    // Check density
    const noiseValue = sampleNoiseMap(noiseMap, p.x, p.y, area)
    return noiseValue < density
  })
  
  if (!['tree', 'rock', 'grass', 'bush', 'flower'].includes(propType)) {
    console.warn(`Unknown prop type: ${propType}`)
    return { root: group, update: null, dispose: () => {} }
  }
  const kits = createEnvironmentKitLibrary()

  // Create instances
  if (propType === 'tree') {
    const trunkPositions = []
    const baseFlares = []
    const branchSegments = []
    const canopyPrimary = []
    const canopySecondary = []
    const surfaceRoots = []
    
    filteredPoints.forEach((p, i) => {
      const worldX = p.x - area / 2
      const worldZ = p.y - area / 2
      const scale = nextScale()
      const yaw = rng.random() * Math.PI * 2
      const lean = (rng.random() - 0.5) * 0.08
      const branchCount = 2 + (i % 2)
      
      trunkPositions.push({
        position: new THREE.Vector3(worldX, kits.pineTrunk.yOffset * scale, worldZ),
        scale: new THREE.Vector3(scale, scale, scale),
        rotation: new THREE.Euler(lean, yaw, lean * 0.5)
      })

      baseFlares.push({
        position: new THREE.Vector3(worldX, kits.baseFlare.yOffset * scale, worldZ),
        scale: new THREE.Vector3(scale, scale, scale),
        rotation: new THREE.Euler(0, yaw, 0)
      })

      for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
        const branchYaw = yaw + (branchIndex / branchCount) * Math.PI * 2 + rng.range(-0.25, 0.25)
        branchSegments.push({
          position: new THREE.Vector3(
            worldX + Math.cos(branchYaw) * 0.12 * scale,
            (kits.branchSegment.yOffset + branchIndex * 0.18) * scale,
            worldZ + Math.sin(branchYaw) * 0.12 * scale
          ),
          scale: new THREE.Vector3(scale, scale, scale),
          rotation: new THREE.Euler(0.2, branchYaw, -0.85 + rng.range(-0.18, 0.18))
        })
      }
      
      canopyPrimary.push({
        position: new THREE.Vector3(worldX, kits.broadleafCanopyPrimary.yOffset * scale, worldZ),
        scale: new THREE.Vector3(scale * 0.95, scale * 0.82, scale * 0.95),
        rotation: new THREE.Euler(0, yaw, 0)
      })

      for (let canopyIndex = 0; canopyIndex < 2; canopyIndex++) {
        const canopyYaw = yaw + (canopyIndex === 0 ? 0.75 : -0.8)
        canopySecondary.push({
          position: new THREE.Vector3(
            worldX + Math.cos(canopyYaw) * 0.34 * scale,
            (kits.broadleafCanopySecondary.yOffset + canopyIndex * 0.16) * scale,
            worldZ + Math.sin(canopyYaw) * 0.34 * scale
          ),
          scale: new THREE.Vector3(scale * 0.72, scale * 0.6, scale * 0.72),
          rotation: new THREE.Euler(0, canopyYaw, 0)
        })
      }

      for (let rootIndex = 0; rootIndex < 3; rootIndex++) {
        const rootYaw = yaw + (rootIndex / 3) * Math.PI * 2
        surfaceRoots.push({
          position: new THREE.Vector3(
            worldX + Math.cos(rootYaw) * 0.1 * scale,
            kits.surfaceRoot.yOffset * scale,
            worldZ + Math.sin(rootYaw) * 0.1 * scale
          ),
          scale: new THREE.Vector3(scale, scale, scale),
          rotation: new THREE.Euler(Math.PI / 2 + 0.22, rootYaw, 0)
        })
      }
    })
    
    if (trunkPositions.length > 0) {
      const trunkInstanced = createInstancedFromTemplate(
        new THREE.Mesh(kits.pineTrunk.geometry, kits.pineTrunk.material),
        trunkPositions
      )
      trunkInstanced.name = 'tree_trunks'
      group.add(trunkInstanced)

      const baseFlareInstanced = createInstancedFromTemplate(
        new THREE.Mesh(kits.baseFlare.geometry, kits.baseFlare.material),
        baseFlares
      )
      baseFlareInstanced.name = 'tree_base_flares'
      group.add(baseFlareInstanced)

      const branchInstanced = createInstancedFromTemplate(
        new THREE.Mesh(kits.branchSegment.geometry, kits.branchSegment.material),
        branchSegments
      )
      branchInstanced.name = 'tree_branch_segments'
      group.add(branchInstanced)
      
      const primaryCanopy = createInstancedFromTemplate(
        new THREE.Mesh(kits.broadleafCanopyPrimary.geometry, kits.broadleafCanopyPrimary.material),
        canopyPrimary
      )
      primaryCanopy.name = 'tree_canopy_primary'
      group.add(primaryCanopy)

      const secondaryCanopy = createInstancedFromTemplate(
        new THREE.Mesh(kits.broadleafCanopySecondary.geometry, kits.broadleafCanopySecondary.material),
        canopySecondary
      )
      secondaryCanopy.name = 'tree_canopy_secondary'
      group.add(secondaryCanopy)

      const rootInstanced = createInstancedFromTemplate(
        new THREE.Mesh(kits.surfaceRoot.geometry, kits.surfaceRoot.material),
        surfaceRoots
      )
      rootInstanced.name = 'tree_surface_roots'
      group.add(rootInstanced)
    }
  } else if (propType === 'flower') {
    const stemInstances = []
    const blossomInstances = []

    filteredPoints.forEach((p, i) => {
      const worldX = p.x - area / 2
      const worldZ = p.y - area / 2
      const scale = nextScale()
      const swayYaw = rng.random() * Math.PI * 2

      stemInstances.push({
        position: new THREE.Vector3(worldX, kits.flowerPatch.stem.yOffset * scale, worldZ),
        scale: new THREE.Vector3(scale, scale, scale),
        rotation: new THREE.Euler((rng.random() - 0.5) * 0.08, swayYaw, (rng.random() - 0.5) * 0.12)
      })

      blossomInstances.push({
        position: new THREE.Vector3(worldX, kits.flowerPatch.blossom.yOffset * scale, worldZ),
        scale: new THREE.Vector3(scale, scale, scale),
        rotation: new THREE.Euler(0, swayYaw + (i % 3) * 0.5, 0)
      })
    })

    if (stemInstances.length > 0) {
      const stems = createInstancedFromTemplate(
        new THREE.Mesh(kits.flowerPatch.stem.geometry, kits.flowerPatch.stem.material),
        stemInstances
      )
      stems.name = 'flower_stems'
      group.add(stems)

      const blossoms = createInstancedFromTemplate(
        new THREE.Mesh(kits.flowerPatch.blossom.geometry, kits.flowerPatch.blossom.material),
        blossomInstances
      )
      blossoms.name = 'flower_blossoms'
      group.add(blossoms)
    }
  } else {
    const positions = filteredPoints.map((p) => {
      const worldX = p.x - area / 2
      const worldZ = p.y - area / 2
      const scale = nextScale()
      
      return {
        position: new THREE.Vector3(
          worldX, 
          propType === 'grass'
            ? kits.grassClump.yOffset * scale
            : propType === 'bush'
              ? kits.shrubMass.yOffset * scale
              : kits.rockMound.yOffset * scale,
          worldZ
        ),
        scale: new THREE.Vector3(scale, scale, scale),
        rotation: new THREE.Euler(
          propType === 'grass' ? -0.1 + rng.random() * 0.2 : 0,
          rng.random() * Math.PI * 2,
          propType === 'grass' ? (rng.random() - 0.5) * 0.3 : 0
        )
      }
    })
    
    if (positions.length > 0) {
      const selectedKit =
        propType === 'grass'
          ? kits.grassClump
          : propType === 'bush'
            ? kits.shrubMass
            : kits.rockMound

      const instanced = createInstancedFromTemplate(
        new THREE.Mesh(selectedKit.geometry, selectedKit.material),
        positions
      )
      instanced.name = `${propType}_instances`
      group.add(instanced)
    }
  }
  
  // Separate tint streams leave placement, scale and rotation draws unchanged.
  // Three multiplies instanceColor by material.color, so these are neutral
  // brightness multipliers, not a second copy of the kit's base color.
  const tintSpread = THREE.MathUtils.clamp(colorVariation, 0, 1) * 0.35
  if (tintSpread > 0) {
    group.traverse(child => {
      if (!child.isInstancedMesh) return
      const tintRng = createRNG(`${seed}:scatter-tint:${child.name}`)
      const tint = new THREE.Color()
      for (let i = 0; i < child.count; i++) {
        const brightness = 1 + tintRng.range(-tintSpread, tintSpread)
        child.setColorAt(i, tint.setRGB(brightness, brightness, brightness))
      }
      child.instanceColor.needsUpdate = true
    })
  }

  const dispose = createAssetDisposer({ dispose() {
    // Instance matrix/color GPU buffers are owned by the mesh, not its geometry.
    group.traverse(child => {
      if (child.isInstancedMesh) child.dispose()
    })
    // Include unused kit allocations in the same deduplicated resource walk.
    disposeObject({ traverse(visit) {
      group.traverse(visit)
      for (const kit of Object.values(kits)) {
        if (kit.geometry) visit(kit)
        else {
          for (const part of Object.values(kit)) visit(part)
        }
      }
    } })
  } })
  
  return {
    root: group,
    update: null,
    dispose
  }
}

export default createEnvironmentScatter
