/**
 * Building Modular Generator - Shape Grammar Engine
 * 
 * Uses a "Split Grammar" approach inspired by CityEngine:
 * Volume → Floors → Façades → Bays → Modules
 * 
 * Combined with "Style Kits" that define the visual vocabulary.
 * Uses ADDITIVE ASSEMBLY (no boolean cuts) for windows and doors.
 */
import * as THREE from 'three'
import { createRNG } from '../runtime/seedRandom'
import { createAssetDisposer } from '../runtime/assetDisposal'
import { STYLE_KITS, getStyleKit } from './styleKits'
import { createArchetypePlan } from './buildingArchetypes'
import { createWindowBay } from './modules/windowModules'
import { createDoorBay, createArchedDoorBay } from './modules/doorModules'
import { createSolidWall, createCornerPilaster, createFoundation, createCornice } from './modules/wallModules'
import { createFlatRoof, createGabledRoof, createHipRoof, createConicalRoof, createChimney } from './modules/roofModules'

/**
 * Create a modular building using the grammar engine
 * 
 * @param {Object} params - Building parameters
 * @param {number} seed - Random seed
 * @param {Object} textures - Optional textures
 * @param {Object} addons - Addon modules (for procedural textures)
 * @returns {{root: THREE.Group, update: Function|null, dispose: Function}}
 */
export function createBuildingModular(params, seed, textures = {}, addons = null) {
  const {
    // Footprint
    footprint = { shape: 'rectangle', width: 10, depth: 8 },
    
    // Structure
    floors = 2,
    archetype = 'custom',
    styleKit = 'industrial_brick',
    
    // Façade
    windowDensity = 'normal',     // sparse, normal, dense
    doorPlacement = 'center',     // center, side, double
    
    // Roof
    roofType = 'gable',           // flat, gable, hip, cone
    hasChimney = false,
    
    // Details
    hasFoundation = true,
    hasCornice = true,
    weathering = 0
  } = params

  const rng = createRNG(seed)
  const group = new THREE.Group()
  group.name = 'buildingModular'

  const plan = createArchetypePlan({
    archetype,
    footprint,
    floors,
    styleKit,
    roofType,
    windowDensity,
    doorPlacement,
    hasChimney,
    hasFoundation,
    hasCornice,
    weathering
  })
  
  // Get style kit
  const kit = getStyleKit(plan.styleKit) || STYLE_KITS.industrial_brick
  
  // Create materials from kit
  const materials = createMaterials(kit, addons)
  
  // Generate footprint edges
  const footprintData = generateFootprint(plan.footprint)
  
  // =========================================
  // STAGE 1: Foundation (optional)
  // =========================================
  if (plan.hasFoundation) {
    const foundationHeight = 0.2
    const foundation = plan.footprint.shape === 'rectangle'
      ? createFoundation(
          plan.footprint.width + 0.3,
          foundationHeight,
          plan.footprint.depth + 0.3,
          materials.trim
        )
      : createFootprintPrism(plan.footprint, foundationHeight, materials.trim, 'footprintFoundation')
    foundation.position.set(0, 0, 0)
    group.add(foundation)
  }
  
  // =========================================
  // STAGE 2: Generate Floors + Façades
  // =========================================
  const floorHeight = kit.rules.floorHeight
  const totalHeight = plan.floors * floorHeight
  const baseY = plan.hasFoundation ? 0.2 : 0
  
  for (let floorIndex = 0; floorIndex < plan.floors; floorIndex++) {
    const floorY = baseY + floorIndex * floorHeight
    const isGroundFloor = floorIndex === 0
    
    // Generate façade for each edge
    footprintData.edges.forEach((edge, edgeIndex) => {
      const facade = generateFacade({
        edge,
        edgeIndex,
        floorHeight,
        kit,
        materials,
        windowDensity: plan.windowDensity,
        doorPlacement: plan.doorPlacement,
        isGroundFloor,
        rng
      })
      
      // Position and rotate façade
      facade.position.set(edge.centerX, floorY, edge.centerZ)
      facade.rotation.y = edge.rotation
      
      group.add(facade)
    })
  }
  
  // =========================================
  // STAGE 3: Corners (pilasters)
  // =========================================
  footprintData.corners.forEach(corner => {
    const pilaster = createCornerPilaster(
      0.15,
      totalHeight,
      0.15,
      materials.trim
    )
    pilaster.position.set(corner.x, baseY, corner.z)
    pilaster.rotation.y = corner.rotation
    group.add(pilaster)
  })
  
  // =========================================
  // STAGE 4: Cornice (decorative roofline)
  // =========================================
  if (plan.hasCornice) {
    footprintData.edges.forEach(edge => {
      const cornice = createCornice(edge.length + 0.2, 0.15, 0.1, materials.trim)
      cornice.position.set(edge.centerX, baseY + totalHeight, edge.centerZ)
      cornice.rotation.y = edge.rotation
      group.add(cornice)
    })
  }
  
  // =========================================
  // STAGE 5: Roof
  // =========================================
  const roofGroup = plan.footprint.shape === 'rectangle'
    ? generateRoof({
        roofType: plan.roofType,
        width: plan.footprint.width,
        depth: plan.footprint.depth,
        kit,
        materials
      })
    : generateFootprintRoof({
        footprint: plan.footprint,
        roofMaterial: materials.roof
      })
  roofGroup.position.y = baseY + totalHeight
  group.add(roofGroup)
  
  // =========================================
  // STAGE 6: Chimney (optional)
  // =========================================
  if (plan.hasChimney && (plan.roofType === 'gable' || plan.roofType === 'hip')) {
    const chimney = createChimney({
      width: 0.5,
      depth: 0.5,
      height: floorHeight * 0.6,
      material: materials.trim
    })
    
    // Position chimney on roof
    const chimneyX = (rng.random() - 0.5) * plan.footprint.width * 0.4
    const roofPitch = kit.rules.roofPitch || 35
    const roofHeight = (plan.footprint.width / 2) * Math.tan((roofPitch * Math.PI) / 180)
    chimney.position.set(chimneyX, baseY + totalHeight + roofHeight * 0.5, 0)
    group.add(chimney)
  }
  
  // =========================================
  // STAGE 7: Weathering (optional)
  // =========================================
  if (plan.weathering > 0) {
    applyWeathering(group, plan.weathering, rng)
  }
  
  // Center the building
  group.position.set(0, 0, 0)
  
  // Cleanup function
  const dispose = createAssetDisposer({ dispose() {
    const resources = new Set(Object.values(materials))
    group.traverse(child => {
      if (child.geometry) resources.add(child.geometry)
      for (const material of [child.material].flat().filter(Boolean)) resources.add(material)
    })
    for (const resource of resources) {
      if (!resource.isMaterial) continue
      for (const value of Object.values(resource)) {
        if (value?.isTexture) resources.add(value)
      }
    }
    resources.forEach(resource => resource.dispose())
  } })

  return {
    root: group,
    update: null,  // Buildings are static by default
    dispose
  }
}

/**
 * Create materials from style kit
 */
function createMaterials(kit, addons) {
  const materials = {}
  
  // Wall material
  materials.wall = new THREE.MeshStandardMaterial({
    color: kit.materials.wall.color,
    roughness: kit.materials.wall.roughness,
    metalness: kit.materials.wall.metalness
  })
  
  // Apply procedural texture if addons available
  if (addons && kit.textures.wall) {
    const textureType = kit.textures.wall
    if (addons.textures && addons.textures[`make${textureType.charAt(0).toUpperCase() + textureType.slice(1)}`]) {
      const texture = addons.textures[`make${textureType.charAt(0).toUpperCase() + textureType.slice(1)}`]({
        baseColor: kit.materials.wall.color
      })
      materials.wall.map = texture
    } else if (textureType === 'brick' && addons.textures?.makeBrick) {
      materials.wall.map = addons.textures.makeBrick({ brickColor: kit.materials.wall.color })
    } else if (textureType === 'concrete' && addons.textures?.makeSpeckle) {
      materials.wall.map = addons.textures.makeSpeckle({ baseColor: kit.materials.wall.color })
    } else if (textureType === 'woodSiding' && addons.textures?.makeWoodGrain) {
      materials.wall.map = addons.textures.makeWoodGrain({ baseColor: kit.materials.wall.color })
    }
  }
  
  // Trim material
  materials.trim = new THREE.MeshStandardMaterial({
    color: kit.materials.trim.color,
    roughness: kit.materials.trim.roughness,
    metalness: kit.materials.trim.metalness
  })
  
  // Glass material
  materials.glass = new THREE.MeshStandardMaterial({
    color: kit.materials.glass.color,
    transparent: true,
    opacity: kit.materials.glass.opacity,
    roughness: kit.materials.glass.roughness,
    metalness: kit.materials.glass.metalness,
    side: THREE.DoubleSide
  })
  
  // Roof material
  materials.roof = new THREE.MeshStandardMaterial({
    color: kit.materials.roof.color,
    roughness: kit.materials.roof.roughness,
    metalness: kit.materials.roof.metalness
  })
  
  // Door material (slightly darker than wall)
  materials.door = new THREE.MeshStandardMaterial({
    color: new THREE.Color(kit.materials.trim.color).offsetHSL(0, 0, -0.1),
    roughness: 0.7,
    metalness: 0.0
  })
  
  return materials
}

/**
 * Generate footprint data (edges and corners)
 */
function generateFootprint(footprint) {
  const { shape, width, depth } = footprint
  
  if (shape === 'rectangle') {
    const halfW = width / 2
    const halfD = depth / 2
    
    return {
      edges: [
        // Front (facing +Z)
        { 
          start: { x: -halfW, z: halfD },
          end: { x: halfW, z: halfD },
          length: width,
          centerX: 0,
          centerZ: halfD,
          rotation: 0,
          normal: { x: 0, z: 1 },
          side: 'front'
        },
        // Right (facing +X)
        {
          start: { x: halfW, z: halfD },
          end: { x: halfW, z: -halfD },
          length: depth,
          centerX: halfW,
          centerZ: 0,
          rotation: -Math.PI / 2,
          normal: { x: 1, z: 0 },
          side: 'right'
        },
        // Back (facing -Z)
        {
          start: { x: halfW, z: -halfD },
          end: { x: -halfW, z: -halfD },
          length: width,
          centerX: 0,
          centerZ: -halfD,
          rotation: Math.PI,
          normal: { x: 0, z: -1 },
          side: 'back'
        },
        // Left (facing -X)
        {
          start: { x: -halfW, z: -halfD },
          end: { x: -halfW, z: halfD },
          length: depth,
          centerX: -halfW,
          centerZ: 0,
          rotation: Math.PI / 2,
          normal: { x: -1, z: 0 },
          side: 'left'
        }
      ],
      corners: [
        { x: -halfW, z: halfD, rotation: Math.PI * 0.25 },
        { x: halfW, z: halfD, rotation: -Math.PI * 0.25 },
        { x: halfW, z: -halfD, rotation: -Math.PI * 0.75 },
        { x: -halfW, z: -halfD, rotation: Math.PI * 0.75 }
      ]
    }
  }
  
  if (shape === 'L') {
    // L-shaped building: main block + wing
    // Wing extends from the right side of the back
    const halfW = width / 2
    const halfD = depth / 2
    const wingWidth = width * 0.4
    const wingDepth = depth * 0.5
    
    return {
      edges: [
        // Main block front
        { 
          start: { x: -halfW, z: halfD },
          end: { x: halfW, z: halfD },
          length: width,
          centerX: 0,
          centerZ: halfD,
          rotation: 0,
          normal: { x: 0, z: 1 },
          side: 'front'
        },
        // Main block right (partial)
        {
          start: { x: halfW, z: halfD },
          end: { x: halfW, z: -halfD + wingDepth },
          length: depth - wingDepth,
          centerX: halfW,
          centerZ: (halfD + (-halfD + wingDepth)) / 2,
          rotation: -Math.PI / 2,
          normal: { x: 1, z: 0 },
          side: 'right'
        },
        // Wing front (inner corner)
        {
          start: { x: halfW, z: -halfD + wingDepth },
          end: { x: halfW - wingWidth, z: -halfD + wingDepth },
          length: wingWidth,
          centerX: halfW - wingWidth / 2,
          centerZ: -halfD + wingDepth,
          rotation: Math.PI,
          normal: { x: 0, z: 1 },
          side: 'wing_inner'
        },
        // Wing left (inner)
        {
          start: { x: halfW - wingWidth, z: -halfD + wingDepth },
          end: { x: halfW - wingWidth, z: -halfD },
          length: wingDepth,
          centerX: halfW - wingWidth,
          centerZ: -halfD + wingDepth / 2,
          rotation: Math.PI / 2,
          normal: { x: -1, z: 0 },
          side: 'wing_left'
        },
        // Main block back (partial)
        {
          start: { x: halfW - wingWidth, z: -halfD },
          end: { x: -halfW, z: -halfD },
          length: width - wingWidth,
          centerX: (halfW - wingWidth - halfW) / 2,
          centerZ: -halfD,
          rotation: Math.PI,
          normal: { x: 0, z: -1 },
          side: 'back'
        },
        // Main block left
        {
          start: { x: -halfW, z: -halfD },
          end: { x: -halfW, z: halfD },
          length: depth,
          centerX: -halfW,
          centerZ: 0,
          rotation: Math.PI / 2,
          normal: { x: -1, z: 0 },
          side: 'left'
        }
      ],
      corners: [
        { x: -halfW, z: halfD, rotation: Math.PI * 0.25 },
        { x: halfW, z: halfD, rotation: -Math.PI * 0.25 },
        { x: halfW, z: -halfD + wingDepth, rotation: -Math.PI * 0.25 },
        { x: halfW - wingWidth, z: -halfD + wingDepth, rotation: Math.PI * 0.75 },
        { x: halfW - wingWidth, z: -halfD, rotation: -Math.PI * 0.75 },
        { x: -halfW, z: -halfD, rotation: Math.PI * 0.75 }
      ]
    }
  }
  
  if (shape === 'U') {
    // U-shaped building: main block + two wings forming courtyard
    const halfW = width / 2
    const halfD = depth / 2
    const wingWidth = width * 0.25
    const courtyardDepth = depth * 0.5
    
    return {
      edges: [
        // Left wing front
        {
          start: { x: -halfW, z: halfD },
          end: { x: -halfW + wingWidth, z: halfD },
          length: wingWidth,
          centerX: -halfW + wingWidth / 2,
          centerZ: halfD,
          rotation: 0,
          normal: { x: 0, z: 1 },
          side: 'front_left'
        },
        // Left wing inner
        {
          start: { x: -halfW + wingWidth, z: halfD },
          end: { x: -halfW + wingWidth, z: halfD - courtyardDepth },
          length: courtyardDepth,
          centerX: -halfW + wingWidth,
          centerZ: halfD - courtyardDepth / 2,
          rotation: -Math.PI / 2,
          normal: { x: 1, z: 0 },
          side: 'left_inner'
        },
        // Courtyard back
        {
          start: { x: -halfW + wingWidth, z: halfD - courtyardDepth },
          end: { x: halfW - wingWidth, z: halfD - courtyardDepth },
          length: width - wingWidth * 2,
          centerX: 0,
          centerZ: halfD - courtyardDepth,
          rotation: 0,
          normal: { x: 0, z: 1 },
          side: 'courtyard'
        },
        // Right wing inner
        {
          start: { x: halfW - wingWidth, z: halfD - courtyardDepth },
          end: { x: halfW - wingWidth, z: halfD },
          length: courtyardDepth,
          centerX: halfW - wingWidth,
          centerZ: halfD - courtyardDepth / 2,
          rotation: Math.PI / 2,
          normal: { x: -1, z: 0 },
          side: 'right_inner'
        },
        // Right wing front
        {
          start: { x: halfW - wingWidth, z: halfD },
          end: { x: halfW, z: halfD },
          length: wingWidth,
          centerX: halfW - wingWidth / 2,
          centerZ: halfD,
          rotation: 0,
          normal: { x: 0, z: 1 },
          side: 'front_right'
        },
        // Right side
        {
          start: { x: halfW, z: halfD },
          end: { x: halfW, z: -halfD },
          length: depth,
          centerX: halfW,
          centerZ: 0,
          rotation: -Math.PI / 2,
          normal: { x: 1, z: 0 },
          side: 'right'
        },
        // Back
        {
          start: { x: halfW, z: -halfD },
          end: { x: -halfW, z: -halfD },
          length: width,
          centerX: 0,
          centerZ: -halfD,
          rotation: Math.PI,
          normal: { x: 0, z: -1 },
          side: 'back'
        },
        // Left side
        {
          start: { x: -halfW, z: -halfD },
          end: { x: -halfW, z: halfD },
          length: depth,
          centerX: -halfW,
          centerZ: 0,
          rotation: Math.PI / 2,
          normal: { x: -1, z: 0 },
          side: 'left'
        }
      ],
      corners: [
        { x: -halfW, z: halfD, rotation: Math.PI * 0.25 },
        { x: -halfW + wingWidth, z: halfD, rotation: -Math.PI * 0.25 },
        { x: -halfW + wingWidth, z: halfD - courtyardDepth, rotation: -Math.PI * 0.75 },
        { x: halfW - wingWidth, z: halfD - courtyardDepth, rotation: Math.PI * 0.75 },
        { x: halfW - wingWidth, z: halfD, rotation: Math.PI * 0.25 },
        { x: halfW, z: halfD, rotation: -Math.PI * 0.25 },
        { x: halfW, z: -halfD, rotation: -Math.PI * 0.75 },
        { x: -halfW, z: -halfD, rotation: Math.PI * 0.75 }
      ]
    }
  }
  
  // Default to rectangle for unknown shapes
  return generateFootprint({ shape: 'rectangle', width, depth })
}

function getFootprintOutline(footprint) {
  const { shape, width, depth } = footprint
  const halfW = width / 2
  const halfD = depth / 2

  if (shape === 'L') {
    const wingWidth = width * 0.4
    const wingDepth = depth * 0.5
    return [
      [-halfW, halfD],
      [halfW, halfD],
      [halfW, -halfD + wingDepth],
      [halfW - wingWidth, -halfD + wingDepth],
      [halfW - wingWidth, -halfD],
      [-halfW, -halfD]
    ]
  }

  if (shape === 'U') {
    const wingWidth = width * 0.25
    const courtyardDepth = depth * 0.5
    return [
      [-halfW, halfD],
      [-halfW + wingWidth, halfD],
      [-halfW + wingWidth, halfD - courtyardDepth],
      [halfW - wingWidth, halfD - courtyardDepth],
      [halfW - wingWidth, halfD],
      [halfW, halfD],
      [halfW, -halfD],
      [-halfW, -halfD]
    ]
  }

  return [
    [-halfW, halfD],
    [halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD]
  ]
}

function createFootprintShape(footprint) {
  const points = getFootprintOutline(footprint)
  const shape = new THREE.Shape()
  points.forEach(([x, z], index) => {
    if (index === 0) {
      shape.moveTo(x, z)
    } else {
      shape.lineTo(x, z)
    }
  })
  shape.closePath()
  return shape
}

function createFootprintPrism(footprint, height, material, name) {
  const geometry = new THREE.ExtrudeGeometry(createFootprintShape(footprint), {
    depth: height,
    bevelEnabled: false
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function generateFootprintRoof({ footprint, roofMaterial }) {
  const group = new THREE.Group()
  group.name = 'footprintRoof'

  const slab = createFootprintPrism(footprint, 0.18, roofMaterial, 'footprintRoofSlab')
  group.add(slab)

  return group
}

/**
 * Generate a single façade using bay system
 */
function generateFacade(config) {
  const {
    edge,
    edgeIndex,
    floorHeight,
    kit,
    materials,
    windowDensity,
    doorPlacement,
    isGroundFloor,
    rng
  } = config

  const group = new THREE.Group()
  group.name = `facade_${edge.side}`
  
  const wallDepth = 0.2
  const bayWidth = kit.rules.bayWidth
  const facadeLength = edge.length
  
  // Calculate bay count
  const bayCount = Math.max(1, Math.floor(facadeLength / bayWidth))
  const actualBayWidth = facadeLength / bayCount
  
  // Determine window probability based on density
  const windowProb = {
    sparse: 0.3,
    normal: 0.6,
    dense: 0.85
  }[windowDensity] || 0.6
  
  // Determine door bay (only on front, ground floor)
  let doorBayIndex = -1
  if (isGroundFloor && edge.side === 'front') {
    if (doorPlacement === 'center') {
      doorBayIndex = Math.floor(bayCount / 2)
    } else if (doorPlacement === 'side') {
      doorBayIndex = bayCount > 2 ? 1 : 0
    } else if (doorPlacement === 'double' && bayCount >= 2) {
      doorBayIndex = Math.floor(bayCount / 2)
    }
  }
  
  // Generate bays
  for (let bayIndex = 0; bayIndex < bayCount; bayIndex++) {
    const bayX = -facadeLength / 2 + actualBayWidth * bayIndex
    let bayModule
    
    if (bayIndex === doorBayIndex) {
      // Door bay
      const doorType = kit.modules.door
      
      if (doorType === 'arched' || doorType === 'archedHeavy') {
        bayModule = createArchedDoorBay({
          bayWidth: actualBayWidth,
          floorHeight,
          doorWidth: kit.rules.doorWidth,
          doorHeight: kit.rules.doorHeight,
          wallDepth,
          wallMaterial: materials.wall,
          trimMaterial: materials.trim,
          doorMaterial: materials.door
        })
      } else {
        bayModule = createDoorBay({
          bayWidth: actualBayWidth,
          floorHeight,
          doorWidth: kit.rules.doorWidth,
          doorHeight: kit.rules.doorHeight,
          wallDepth,
          wallMaterial: materials.wall,
          trimMaterial: materials.trim,
          doorMaterial: materials.door,
          doorType
        })
      }
    } else if (rng.random() < windowProb) {
      // Window bay
      const windowWidth = actualBayWidth * kit.rules.windowRatio
      const windowHeight = floorHeight - kit.rules.sillHeight - kit.rules.headerHeight
      
      bayModule = createWindowBay({
        bayWidth: actualBayWidth,
        floorHeight,
        windowWidth: Math.min(windowWidth, actualBayWidth * 0.8),
        windowHeight: Math.max(0.5, windowHeight),
        sillHeight: kit.rules.sillHeight,
        wallDepth,
        wallMaterial: materials.wall,
        trimMaterial: materials.trim,
        glassMaterial: materials.glass,
        windowType: kit.modules.window
      })
    } else {
      // Solid wall bay
      bayModule = createSolidWall(actualBayWidth, floorHeight, wallDepth, materials.wall)
    }
    
    bayModule.position.x = bayX
    group.add(bayModule)
  }

  // The timber style declares exposed framing, not just plaster-colored walls.
  // Place posts on bay boundaries so they do not cover windows or doors.
  if (kit.modules.wall === 'timberFrame') {
    const frame = new THREE.Group()
    frame.name = 'timberFrame'
    const thickness = kit.rules.trimThickness || 0.1
    const postGeometry = new THREE.BoxGeometry(thickness, floorHeight, wallDepth + thickness)
    const railGeometry = new THREE.BoxGeometry(facadeLength, thickness, wallDepth + thickness)
    for (let i = 0; i <= bayCount; i++) {
      const post = new THREE.Mesh(postGeometry, materials.trim)
      post.position.set(-facadeLength / 2 + i * actualBayWidth, floorHeight / 2, 0)
      post.castShadow = post.receiveShadow = true
      frame.add(post)
    }
    for (const y of [thickness / 2, floorHeight - thickness / 2]) {
      const rail = new THREE.Mesh(railGeometry, materials.trim)
      rail.position.y = y
      rail.castShadow = rail.receiveShadow = true
      frame.add(rail)
    }
    group.add(frame)
  }
  
  return group
}

/**
 * Generate roof based on type
 */
function generateRoof(config) {
  const { roofType, width, depth, kit, materials } = config
  
  switch (roofType) {
    case 'flat':
      return createFlatRoof({
        width,
        depth,
        parapetHeight: 0.5,
        parapetThickness: 0.15,
        roofMaterial: materials.roof,
        wallMaterial: materials.wall
      })
      
    case 'gable':
      return createGabledRoof({
        width,
        depth,
        pitch: kit.rules.roofPitch || 35,
        overhang: 0.3,
        roofMaterial: materials.roof,
        trimMaterial: materials.trim
      })
      
    case 'hip':
      return createHipRoof({
        width,
        depth,
        pitch: kit.rules.roofPitch || 30,
        overhang: 0.3,
        roofMaterial: materials.roof,
        trimMaterial: materials.trim
      })
      
    case 'cone':
      return createConicalRoof({
        radius: Math.max(width, depth) / 2,
        height: Math.max(width, depth) * 0.6,
        overhang: 0.2,
        roofMaterial: materials.roof
      })
      
    default:
      return createFlatRoof({
        width,
        depth,
        parapetHeight: 0.4,
        roofMaterial: materials.roof,
        wallMaterial: materials.wall
      })
  }
}

/**
 * Apply weathering effects
 * - Grime gradient (darker at bottom)
 * - Color variation per panel
 * - Roughness increase
 */
function applyWeathering(group, amount, rng) {
  const processedMaterials = new Set()
  
  group.traverse(child => {
    if (child.isMesh && child.material && !child.material.transparent) {
      // Clone material to avoid affecting shared materials
      if (!processedMaterials.has(child.material)) {
        // Create unique material for this mesh if weathering is significant
        if (amount > 0.3) {
          child.material = child.material.clone()
        }
        
        // Get world position for height-based grime
        const worldY = child.getWorldPosition(new THREE.Vector3()).y
        
        // Lower parts get more grime (darker)
        const grimeAmount = Math.max(0, 1 - worldY / 10) * amount * 0.15
        
        // Random variation per panel
        const colorVariation = (rng.random() - 0.5) * amount * 0.08
        
        // Apply color adjustments
        if (child.material.color) {
          child.material.color.offsetHSL(
            0,                           // No hue shift
            -amount * 0.1,               // Desaturate slightly
            -grimeAmount + colorVariation // Darken + variation
          )
        }
        
        // Increase roughness for aged look
        if (child.material.roughness !== undefined) {
          child.material.roughness = Math.min(1, child.material.roughness + amount * 0.15)
        }
        
        processedMaterials.add(child.material)
      }
    }
  })
}

// Export for registration
export default createBuildingModular
