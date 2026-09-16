import * as THREE from 'three'
import { createRNG } from '../runtime/seedRandom'
import { createAssetDisposer, disposeObject } from '../runtime/assetDisposal'

/**
 * Creates a simple building structure
 * @param {Object} params - Generator parameters
 * @param {number} seed - Random seed
 * @param {Object} textures - Optional textures (wallTexture, roofTexture)
 * @returns {{root: THREE.Group, tick: null, dispose: Function}}
 */
export function createSimpleBuilding(params, seed, textures = {}) {
  const {
    style = 'cottage',
    width = 4,
    depth = 3,
    height = 3,
    wallColor = '#d4a574',
    roofColor = '#8b4513',
    roofType = 'gabled',
    hasChimney = true,
    hasDoor = true,
    hasWindows = true
  } = params

  const rng = createRNG(seed)
  const group = new THREE.Group()
  group.name = 'simpleBuilding'
  
  // Load textures if provided
  const loadedTextures = {}
  const loader = new THREE.TextureLoader()
  
  if (textures.wallTexture) {
    loadedTextures.wall = loader.load(textures.wallTexture)
    loadedTextures.wall.wrapS = loadedTextures.wall.wrapT = THREE.RepeatWrapping
    loadedTextures.wall.repeat.set(2, 2)
  }
  
  if (textures.roofTexture) {
    loadedTextures.roof = loader.load(textures.roofTexture)
    loadedTextures.roof.wrapS = loadedTextures.roof.wrapT = THREE.RepeatWrapping
    loadedTextures.roof.repeat.set(3, 2)
  }

  // Apply style-specific adjustments
  const styleParams = getStyleParams(style, { width, depth, height })
  const w = styleParams.width
  const d = styleParams.depth
  const h = styleParams.height

  // Materials
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: loadedTextures.wall ? 0xffffff : wallColor,
    map: loadedTextures.wall || null,
    roughness: 0.9,
    metalness: 0
  })

  const roofMaterial = new THREE.MeshStandardMaterial({
    color: loadedTextures.roof ? 0xffffff : roofColor,
    map: loadedTextures.roof || null,
    roughness: 0.8,
    metalness: 0
  })

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(wallColor).offsetHSL(0, 0, -0.2),
    roughness: 0.7
  })

  // Main walls
  const wallsGeometry = new THREE.BoxGeometry(w, h, d)
  const walls = new THREE.Mesh(wallsGeometry, wallMaterial)
  walls.position.y = h / 2
  walls.castShadow = true
  walls.receiveShadow = true
  group.add(walls)

  // Roof
  const roof = createRoof(w, d, h, roofType, roofMaterial, styleParams)
  group.add(roof)

  // Door
  if (hasDoor) {
    const door = createDoor(w, h, d, trimMaterial, rng)
    group.add(door)
  }

  // Windows
  if (hasWindows) {
    const windows = createWindows(w, h, d, trimMaterial, style, rng)
    windows.forEach(win => group.add(win))
  }

  // Chimney
  if (hasChimney && (roofType === 'gabled' || roofType === 'pointed')) {
    const chimney = createChimney(w, d, h, roofType, trimMaterial, rng)
    group.add(chimney)
  }

  // Add some details based on style
  addStyleDetails(group, style, w, d, h, trimMaterial, rng)

  // Cleanup
  const dispose = createAssetDisposer({ dispose() {
    // Traverse glass and shared detail geometry too. Trim is owned even when
    // all optional trim-bearing parts are disabled, so release it explicitly.
    disposeObject(group, [trimMaterial])
    trimMaterial.dispose()
  } })

  return { root: group, tick: null, dispose }
}

function getStyleParams(style, base) {
  switch (style) {
    case 'tower':
      return {
        width: Math.min(base.width, base.depth) * 0.7,
        depth: Math.min(base.width, base.depth) * 0.7,
        height: base.height * 2
      }
    case 'shed':
      return {
        width: base.width,
        depth: base.depth * 0.6,
        height: base.height * 0.6
      }
    case 'cabin':
      return {
        width: base.width * 0.9,
        depth: base.depth * 0.9,
        height: base.height * 0.8
      }
    case 'cottage':
    default:
      return { width: base.width, depth: base.depth, height: base.height }
  }
}

function createRoof(w, d, h, roofType, material, styleParams) {
  const group = new THREE.Group()
  
  switch (roofType) {
    case 'flat':
      const flatRoof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.2, 0.2, d + 0.2),
        material
      )
      flatRoof.position.y = h + 0.1
      flatRoof.castShadow = true
      group.add(flatRoof)
      break
      
    case 'pointed':
      const coneRoof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.7, h * 0.6, 4),
        material
      )
      coneRoof.position.y = h + h * 0.3
      coneRoof.rotation.y = Math.PI / 4
      coneRoof.castShadow = true
      group.add(coneRoof)
      break
      
    case 'gabled':
    default:
      const roofHeight = Math.min(w, d) * 0.4
      
      // Create roof using extrusion
      const roofShape = new THREE.Shape()
      roofShape.moveTo(-w / 2 - 0.2, 0)
      roofShape.lineTo(0, roofHeight)
      roofShape.lineTo(w / 2 + 0.2, 0)
      roofShape.lineTo(-w / 2 - 0.2, 0)
      
      const extrudeSettings = {
        steps: 1,
        depth: d + 0.4,
        bevelEnabled: false
      }
      
      const roofGeometry = new THREE.ExtrudeGeometry(roofShape, extrudeSettings)
      const roof = new THREE.Mesh(roofGeometry, material)
      roof.position.set(0, h, -d / 2 - 0.2)
      roof.castShadow = true
      group.add(roof)
      break
  }
  
  return group
}

function createDoor(w, h, d, material, rng) {
  const doorWidth = 0.8
  const doorHeight = h * 0.6
  
  const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, 0.1)
  const door = new THREE.Mesh(doorGeometry, material)
  
  // Random position along front
  const xOffset = rng.range(-w * 0.2, w * 0.2)
  door.position.set(xOffset, doorHeight / 2, d / 2 + 0.05)
  
  return door
}

function createWindows(w, h, d, material, style, rng) {
  const windows = []
  const windowSize = style === 'tower' ? 0.4 : 0.6
  const windowDepth = 0.1
  
  // Window positions depend on style
  const windowCount = style === 'tower' ? 4 : 2
  
  for (let i = 0; i < windowCount; i++) {
    const windowGeometry = new THREE.BoxGeometry(windowSize, windowSize, windowDepth)
    
    // Glass inset
    const glassGeometry = new THREE.BoxGeometry(windowSize * 0.8, windowSize * 0.8, windowDepth / 2)
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x87ceeb,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.8
    })
    
    const frame = new THREE.Mesh(windowGeometry, material)
    const glass = new THREE.Mesh(glassGeometry, glassMaterial)
    
    // Position based on index
    if (style === 'tower') {
      // Windows around the tower
      const angle = (i / windowCount) * Math.PI * 2
      const side = Math.floor(i % 4)
      
      switch (side) {
        case 0: // Front
          frame.position.set(0, h * 0.6, d / 2 + 0.05)
          glass.position.copy(frame.position)
          glass.position.z += 0.03
          break
        case 1: // Right
          frame.position.set(w / 2 + 0.05, h * 0.6, 0)
          frame.rotation.y = Math.PI / 2
          glass.position.copy(frame.position)
          glass.position.x += 0.03
          glass.rotation.y = Math.PI / 2
          break
        case 2: // Back
          frame.position.set(0, h * 0.6, -d / 2 - 0.05)
          glass.position.copy(frame.position)
          glass.position.z -= 0.03
          break
        case 3: // Left
          frame.position.set(-w / 2 - 0.05, h * 0.6, 0)
          frame.rotation.y = Math.PI / 2
          glass.position.copy(frame.position)
          glass.position.x -= 0.03
          glass.rotation.y = Math.PI / 2
          break
      }
    } else {
      // Side windows for cottages/cabins
      const xPos = (i === 0 ? -1 : 1) * w * 0.3
      frame.position.set(xPos, h * 0.55, d / 2 + 0.05)
      glass.position.copy(frame.position)
      glass.position.z += 0.03
    }
    
    windows.push(frame)
    windows.push(glass)
  }
  
  return windows
}

function createChimney(w, d, h, roofType, material, rng) {
  const chimneyWidth = 0.4
  const chimneyHeight = h * 0.5
  
  const chimneyGeometry = new THREE.BoxGeometry(chimneyWidth, chimneyHeight, chimneyWidth)
  const chimney = new THREE.Mesh(chimneyGeometry, material)
  
  const xOffset = rng.range(w * 0.1, w * 0.3) * (rng.bool() ? 1 : -1)
  const baseY = roofType === 'pointed' ? h + h * 0.3 : h + (Math.min(w, d) * 0.2)
  
  chimney.position.set(xOffset, baseY + chimneyHeight / 2, 0)
  chimney.castShadow = true
  
  return chimney
}

function addStyleDetails(group, style, w, d, h, material, rng) {
  switch (style) {
    case 'cabin':
      // Add log texture effect with horizontal beams
      const beamCount = 5
      for (let i = 0; i < beamCount; i++) {
        const beamGeometry = new THREE.BoxGeometry(w + 0.1, 0.05, 0.1)
        const beam = new THREE.Mesh(beamGeometry, material)
        beam.position.set(0, (i + 0.5) * (h / beamCount), d / 2 + 0.05)
        group.add(beam)
        
        const beamBack = beam.clone()
        beamBack.position.z = -d / 2 - 0.05
        group.add(beamBack)
      }
      break
      
    case 'cottage':
      // Add foundation stones
      const foundationGeometry = new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3)
      const foundation = new THREE.Mesh(foundationGeometry, material)
      foundation.position.y = 0.15
      group.add(foundation)
      break
      
    case 'tower':
      // Add battlements
      const battlementCount = 4
      for (let i = 0; i < battlementCount; i++) {
        const angle = (i / battlementCount) * Math.PI * 2 + Math.PI / 4
        const bGeom = new THREE.BoxGeometry(0.3, 0.4, 0.2)
        const battlement = new THREE.Mesh(bGeom, material)
        
        const radius = Math.max(w, d) * 0.5
        battlement.position.set(
          Math.cos(angle) * radius,
          h + h * 0.6 + 0.2,
          Math.sin(angle) * radius
        )
        battlement.lookAt(0, battlement.position.y, 0)
        group.add(battlement)
      }
      break
  }
}
