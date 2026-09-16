/**
 * Wall Module Generators
 * Creates wall panels for additive facade assembly
 */
import * as THREE from 'three'

/**
 * Create a simple wall panel
 * @param {number} width - Panel width
 * @param {number} height - Panel height
 * @param {number} depth - Panel depth/thickness
 * @param {THREE.Material} material - Wall material
 * @returns {THREE.Mesh}
 */
export function createWallPanel(width, height, depth, material) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Create a solid wall module (fills entire bay)
 * @param {number} bayWidth - Width of the bay
 * @param {number} floorHeight - Height of the floor
 * @param {number} wallDepth - Wall thickness
 * @param {THREE.Material} material - Wall material
 * @returns {THREE.Group}
 */
export function createSolidWall(bayWidth, floorHeight, wallDepth, material) {
  const group = new THREE.Group()
  group.name = 'solidWall'
  
  const wall = createWallPanel(bayWidth, floorHeight, wallDepth, material)
  wall.position.set(bayWidth / 2, floorHeight / 2, 0)
  group.add(wall)
  
  return group
}

/**
 * Create corner pilaster (decorative column at building corners)
 * @param {number} width - Pilaster width
 * @param {number} height - Full floor height
 * @param {number} depth - Pilaster depth/projection
 * @param {THREE.Material} material - Trim material
 * @returns {THREE.Group}
 */
export function createCornerPilaster(width, height, depth, material) {
  const group = new THREE.Group()
  group.name = 'cornerPilaster'
  
  const pilaster = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material
  )
  pilaster.position.set(width / 2, height / 2, depth / 2)
  pilaster.castShadow = true
  group.add(pilaster)
  
  return group
}

/**
 * Create foundation/base strip
 * @param {number} length - Foundation length
 * @param {number} height - Foundation height
 * @param {number} depth - Foundation depth
 * @param {THREE.Material} material - Foundation material
 * @returns {THREE.Mesh}
 */
export function createFoundation(length, height, depth, material) {
  const geometry = new THREE.BoxGeometry(length, height, depth)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = height / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Create a parapet wall section (raised edge on flat roof)
 * @param {number} length - Parapet length
 * @param {number} height - Parapet height
 * @param {number} thickness - Parapet thickness
 * @param {THREE.Material} material - Wall material
 * @returns {THREE.Mesh}
 */
export function createParapet(length, height, thickness, material) {
  const geometry = new THREE.BoxGeometry(length, height, thickness)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  return mesh
}

/**
 * Create decorative cornice (horizontal molding at roofline)
 * @param {number} length - Cornice length
 * @param {number} height - Cornice height
 * @param {number} projection - How far cornice projects from wall
 * @param {THREE.Material} material - Trim material
 * @returns {THREE.Group}
 */
export function createCornice(length, height, projection, material) {
  const group = new THREE.Group()
  group.name = 'cornice'
  
  // Main cornice body
  const mainGeo = new THREE.BoxGeometry(length, height * 0.6, projection)
  const main = new THREE.Mesh(mainGeo, material)
  main.position.z = projection / 2
  group.add(main)
  
  // Bottom lip
  const lipGeo = new THREE.BoxGeometry(length, height * 0.4, projection * 0.6)
  const lip = new THREE.Mesh(lipGeo, material)
  lip.position.set(0, -height * 0.5, projection * 0.3)
  group.add(lip)
  
  group.castShadow = true
  return group
}
