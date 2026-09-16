/**
 * Roof Module Generators
 * Creates various roof types for buildings
 */
import * as THREE from 'three'

/**
 * Create a flat roof with parapet
 * @param {Object} config
 * @param {number} config.width - Building width
 * @param {number} config.depth - Building depth
 * @param {number} config.parapetHeight - Height of parapet wall
 * @param {number} config.parapetThickness - Thickness of parapet
 * @param {THREE.Material} config.roofMaterial - Material for roof surface
 * @param {THREE.Material} config.wallMaterial - Material for parapet
 * @returns {THREE.Group}
 */
export function createFlatRoof(config) {
  const {
    width,
    depth,
    parapetHeight = 0.6,
    parapetThickness = 0.15,
    roofMaterial,
    wallMaterial
  } = config

  const group = new THREE.Group()
  group.name = 'flatRoof'
  
  // Main roof slab
  const slabGeo = new THREE.BoxGeometry(width, 0.15, depth)
  const slab = new THREE.Mesh(slabGeo, roofMaterial)
  slab.position.y = 0.075
  slab.receiveShadow = true
  group.add(slab)
  
  // Parapet walls (4 sides)
  if (parapetHeight > 0) {
    // Front parapet
    const frontParapet = new THREE.Mesh(
      new THREE.BoxGeometry(width + parapetThickness * 2, parapetHeight, parapetThickness),
      wallMaterial
    )
    frontParapet.position.set(0, 0.15 + parapetHeight / 2, depth / 2 + parapetThickness / 2)
    frontParapet.castShadow = true
    group.add(frontParapet)
    
    // Back parapet
    const backParapet = frontParapet.clone()
    backParapet.position.z = -depth / 2 - parapetThickness / 2
    group.add(backParapet)
    
    // Left parapet
    const leftParapet = new THREE.Mesh(
      new THREE.BoxGeometry(parapetThickness, parapetHeight, depth),
      wallMaterial
    )
    leftParapet.position.set(-width / 2 - parapetThickness / 2, 0.15 + parapetHeight / 2, 0)
    leftParapet.castShadow = true
    group.add(leftParapet)
    
    // Right parapet
    const rightParapet = leftParapet.clone()
    rightParapet.position.x = width / 2 + parapetThickness / 2
    group.add(rightParapet)
    
    // Parapet cap
    const capGeo = new THREE.BoxGeometry(width + parapetThickness * 4, 0.05, parapetThickness + 0.05)
    const capMat = wallMaterial.clone ? wallMaterial.clone() : wallMaterial
    
    const frontCap = new THREE.Mesh(capGeo, capMat)
    frontCap.position.set(0, 0.15 + parapetHeight + 0.025, depth / 2 + parapetThickness / 2)
    group.add(frontCap)
    
    const backCap = frontCap.clone()
    backCap.position.z = -depth / 2 - parapetThickness / 2
    group.add(backCap)
  }
  
  return group
}

/**
 * Create a gabled roof (triangular profile)
 * @param {Object} config
 * @param {number} config.width - Building width
 * @param {number} config.depth - Building depth
 * @param {number} config.pitch - Roof pitch in degrees
 * @param {number} config.overhang - Eave overhang distance
 * @param {THREE.Material} config.roofMaterial - Material for roof
 * @param {THREE.Material} config.trimMaterial - Material for fascia/trim
 * @returns {THREE.Group}
 */
export function createGabledRoof(config) {
  const {
    width,
    depth,
    pitch = 35,
    overhang = 0.3,
    roofMaterial,
    trimMaterial
  } = config

  const group = new THREE.Group()
  group.name = 'gabledRoof'
  
  const pitchRad = (pitch * Math.PI) / 180
  const roofHeight = (width / 2) * Math.tan(pitchRad)
  const roofWidth = width + overhang * 2
  const roofDepth = depth + overhang * 2
  
  // Create roof using extrusion for proper gable shape
  const roofShape = new THREE.Shape()
  roofShape.moveTo(-roofWidth / 2, 0)
  roofShape.lineTo(0, roofHeight)
  roofShape.lineTo(roofWidth / 2, 0)
  roofShape.lineTo(-roofWidth / 2, 0)
  
  const extrudeSettings = {
    steps: 1,
    depth: roofDepth,
    bevelEnabled: false
  }
  
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings)
  const roof = new THREE.Mesh(roofGeo, roofMaterial)
  roof.position.set(0, 0, -roofDepth / 2)
  roof.castShadow = true
  roof.receiveShadow = true
  group.add(roof)
  
  // Fascia boards (edge trim)
  const fasciaThickness = 0.08
  
  // Front fascia (angled)
  const halfWidth = roofWidth / 2
  const fasciaLength = Math.sqrt(halfWidth * halfWidth + roofHeight * roofHeight)
  const fasciaAngle = Math.atan2(roofHeight, halfWidth)
  
  // Left front fascia
  const leftFascia = new THREE.Mesh(
    new THREE.BoxGeometry(fasciaLength, fasciaThickness, fasciaThickness),
    trimMaterial
  )
  leftFascia.rotation.z = fasciaAngle
  leftFascia.position.set(-halfWidth / 2, roofHeight / 2, roofDepth / 2)
  group.add(leftFascia)
  
  // Right front fascia
  const rightFascia = new THREE.Mesh(
    new THREE.BoxGeometry(fasciaLength, fasciaThickness, fasciaThickness),
    trimMaterial
  )
  rightFascia.rotation.z = -fasciaAngle
  rightFascia.position.set(halfWidth / 2, roofHeight / 2, roofDepth / 2)
  group.add(rightFascia)
  
  // Back fascias
  const leftBackFascia = leftFascia.clone()
  leftBackFascia.position.z = -roofDepth / 2
  group.add(leftBackFascia)
  
  const rightBackFascia = rightFascia.clone()
  rightBackFascia.position.z = -roofDepth / 2
  group.add(rightBackFascia)
  
  // Ridge cap
  const ridgeCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.1, roofDepth + 0.1),
    trimMaterial
  )
  ridgeCap.position.set(0, roofHeight + 0.05, 0)
  group.add(ridgeCap)
  
  return group
}

/**
 * Create a hip roof (sloped on all 4 sides)
 * @param {Object} config
 * @param {number} config.width - Building width
 * @param {number} config.depth - Building depth
 * @param {number} config.pitch - Roof pitch in degrees
 * @param {number} config.overhang - Eave overhang distance
 * @param {THREE.Material} config.roofMaterial - Material for roof
 * @param {THREE.Material} config.trimMaterial - Material for trim
 * @returns {THREE.Group}
 */
export function createHipRoof(config) {
  const {
    width,
    depth,
    pitch = 30,
    overhang = 0.3,
    roofMaterial,
    trimMaterial
  } = config

  const group = new THREE.Group()
  group.name = 'hipRoof'
  
  const pitchRad = (pitch * Math.PI) / 180
  const minDim = Math.min(width, depth)
  const roofHeight = (minDim / 2) * Math.tan(pitchRad)
  const roofWidth = width + overhang * 2
  const roofDepth = depth + overhang * 2
  
  // Create hip roof using custom geometry
  // We'll create 4 triangular faces that meet at a ridge or point
  const geometry = new THREE.BufferGeometry()
  
  // Calculate ridge length
  const ridgeLength = Math.max(0, Math.abs(width - depth))
  const ridgeOffset = ridgeLength / 2
  
  // Vertices for hip roof
  const halfW = roofWidth / 2
  const halfD = roofDepth / 2
  
  const vertices = new Float32Array([
    // Front face (triangle or trapezoid)
    -halfW, 0, halfD,
    halfW, 0, halfD,
    ridgeOffset, roofHeight, 0,
    -ridgeOffset, roofHeight, 0,
    
    // Back face
    halfW, 0, -halfD,
    -halfW, 0, -halfD,
    -ridgeOffset, roofHeight, 0,
    ridgeOffset, roofHeight, 0,
    
    // Left face
    -halfW, 0, -halfD,
    -halfW, 0, halfD,
    -ridgeOffset, roofHeight, 0,
    
    // Right face
    halfW, 0, halfD,
    halfW, 0, -halfD,
    ridgeOffset, roofHeight, 0,
  ])
  
  const indices = [
    // Front
    0, 1, 2,
    0, 2, 3,
    // Back
    4, 5, 6,
    4, 6, 7,
    // Left
    8, 9, 10,
    // Right
    11, 12, 13,
  ]
  
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  
  const roof = new THREE.Mesh(geometry, roofMaterial)
  roof.castShadow = true
  roof.receiveShadow = true
  group.add(roof)
  
  // Ridge cap (if there's a ridge)
  if (ridgeLength > 0.1) {
    const ridgeCap = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, ridgeLength + 0.1),
      trimMaterial
    )
    ridgeCap.position.set(0, roofHeight + 0.04, 0)
    group.add(ridgeCap)
  }
  
  return group
}

/**
 * Create a conical/tower roof
 * @param {Object} config
 * @param {number} config.radius - Base radius
 * @param {number} config.height - Cone height
 * @param {number} config.overhang - Eave overhang
 * @param {THREE.Material} config.roofMaterial - Material for roof
 * @returns {THREE.Group}
 */
export function createConicalRoof(config) {
  const {
    radius,
    height,
    overhang = 0.2,
    roofMaterial
  } = config

  const group = new THREE.Group()
  group.name = 'conicalRoof'
  
  const coneGeo = new THREE.ConeGeometry(radius + overhang, height, 16)
  const cone = new THREE.Mesh(coneGeo, roofMaterial)
  cone.position.y = height / 2
  cone.castShadow = true
  group.add(cone)
  
  // Finial (decorative top piece)
  const finialGeo = new THREE.SphereGeometry(0.08, 8, 8)
  const finialMat = new THREE.MeshStandardMaterial({
    color: 0x808080,
    roughness: 0.3,
    metalness: 0.5
  })
  const finial = new THREE.Mesh(finialGeo, finialMat)
  finial.position.y = height + 0.08
  group.add(finial)
  
  return group
}

/**
 * Create a chimney
 * @param {Object} config
 * @param {number} config.width - Chimney width
 * @param {number} config.depth - Chimney depth
 * @param {number} config.height - Chimney height
 * @param {THREE.Material} config.material - Chimney material
 * @returns {THREE.Group}
 */
export function createChimney(config) {
  const {
    width = 0.5,
    depth = 0.5,
    height = 1.5,
    material
  } = config

  const group = new THREE.Group()
  group.name = 'chimney'
  
  // Main chimney body
  const bodyGeo = new THREE.BoxGeometry(width, height, depth)
  const body = new THREE.Mesh(bodyGeo, material)
  body.position.y = height / 2
  body.castShadow = true
  group.add(body)
  
  // Chimney cap
  const capGeo = new THREE.BoxGeometry(width + 0.1, 0.1, depth + 0.1)
  const cap = new THREE.Mesh(capGeo, material)
  cap.position.y = height + 0.05
  group.add(cap)
  
  // Chimney pot (simplified)
  const potGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8)
  const pot = new THREE.Mesh(potGeo, material)
  pot.position.y = height + 0.2
  group.add(pot)
  
  return group
}
