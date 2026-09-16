/**
 * Door Module Generators
 * Creates door assemblies using additive construction
 */
import * as THREE from 'three'
import { createWallPanel } from './wallModules.js'

/**
 * Create a door bay using ADDITIVE ASSEMBLY
 * 
 * @param {Object} config - Door configuration
 * @param {number} config.bayWidth - Total width of the bay
 * @param {number} config.floorHeight - Total height of the floor
 * @param {number} config.doorWidth - Width of door opening
 * @param {number} config.doorHeight - Height of door opening
 * @param {number} config.wallDepth - Wall thickness
 * @param {THREE.Material} config.wallMaterial - Material for wall panels
 * @param {THREE.Material} config.trimMaterial - Material for door frame
 * @param {THREE.Material} config.doorMaterial - Material for door itself
 * @param {string} config.doorType - Type of door (standard, double, arched, etc.)
 * @returns {THREE.Group}
 */
export function createDoorBay(config) {
  const {
    bayWidth,
    floorHeight,
    doorWidth,
    doorHeight,
    wallDepth,
    wallMaterial,
    trimMaterial,
    doorMaterial,
    doorType = 'standard'
  } = config

  const group = new THREE.Group()
  group.name = 'doorBay'
  
  // Calculate panel dimensions
  const headerHeight = floorHeight - doorHeight
  const sideWidth = (bayWidth - doorWidth) / 2
  
  // ===== ADDITIVE ASSEMBLY: Build wall panels around opening =====
  
  // Top header panel (above door)
  if (headerHeight > 0.05) {
    const headerPanel = createWallPanel(bayWidth, headerHeight, wallDepth, wallMaterial)
    headerPanel.position.set(bayWidth / 2, doorHeight + headerHeight / 2, 0)
    group.add(headerPanel)
  }
  
  // Left side panel
  if (sideWidth > 0.05) {
    const leftPanel = createWallPanel(sideWidth, doorHeight, wallDepth, wallMaterial)
    leftPanel.position.set(sideWidth / 2, doorHeight / 2, 0)
    group.add(leftPanel)
  }
  
  // Right side panel
  if (sideWidth > 0.05) {
    const rightPanel = createWallPanel(sideWidth, doorHeight, wallDepth, wallMaterial)
    rightPanel.position.set(bayWidth - sideWidth / 2, doorHeight / 2, 0)
    group.add(rightPanel)
  }
  
  // ===== DOOR FRAME + DOOR (in the opening) =====
  const doorGroup = createDoorFrame({
    width: doorWidth,
    height: doorHeight,
    trimMaterial,
    doorMaterial,
    type: doorType,
    insetDepth: wallDepth * 0.3
  })
  doorGroup.position.set(bayWidth / 2, doorHeight / 2, wallDepth * 0.1)
  group.add(doorGroup)
  
  // Optional: Add step/threshold
  const stepGeo = new THREE.BoxGeometry(doorWidth + 0.2, 0.1, wallDepth + 0.3)
  const step = new THREE.Mesh(stepGeo, trimMaterial)
  step.position.set(bayWidth / 2, 0.05, wallDepth * 0.15)
  step.castShadow = true
  step.receiveShadow = true
  group.add(step)
  
  return group
}

/**
 * Create the actual door frame and door
 * @param {Object} config
 * @returns {THREE.Group}
 */
export function createDoorFrame(config) {
  const {
    width,
    height,
    trimMaterial,
    doorMaterial,
    type = 'standard',
    insetDepth = 0.1
  } = config

  const group = new THREE.Group()
  group.name = 'doorFrame'
  
  const frameThickness = 0.08
  const frameDepth = 0.1
  
  // Door frame (3 pieces - top, left, right)
  const topFrame = new THREE.Mesh(
    new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, frameDepth),
    trimMaterial
  )
  topFrame.position.set(0, height / 2 + frameThickness / 2, 0)
  group.add(topFrame)
  
  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height, frameDepth),
    trimMaterial
  )
  leftFrame.position.set(-width / 2 - frameThickness / 2, 0, 0)
  group.add(leftFrame)
  
  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height, frameDepth),
    trimMaterial
  )
  rightFrame.position.set(width / 2 + frameThickness / 2, 0, 0)
  group.add(rightFrame)
  
  // Door panel(s)
  if (type === 'double' || type === 'glassDouble' || type === 'industrialDouble') {
    // Double doors
    const doorLeafWidth = (width - 0.02) / 2
    const leftDoor = createDoorPanel(doorLeafWidth, height - 0.05, doorMaterial, type)
    leftDoor.position.set(-doorLeafWidth / 2 - 0.005, -0.025, -insetDepth)
    group.add(leftDoor)
    
    const rightDoor = createDoorPanel(doorLeafWidth, height - 0.05, doorMaterial, type)
    rightDoor.position.set(doorLeafWidth / 2 + 0.005, -0.025, -insetDepth)
    group.add(rightDoor)
  } else {
    // Single door
    const door = createDoorPanel(width - 0.04, height - 0.05, doorMaterial, type)
    door.position.set(0, -0.025, -insetDepth)
    group.add(door)
  }
  
  return group
}

/**
 * Create a single door panel
 * @param {number} width
 * @param {number} height
 * @param {THREE.Material} material
 * @param {string} type
 * @returns {THREE.Group}
 */
function createDoorPanel(width, height, material, type) {
  const group = new THREE.Group()
  const doorDepth = 0.04
  
  // Main door body
  const doorGeo = new THREE.BoxGeometry(width, height, doorDepth)
  const door = new THREE.Mesh(doorGeo, material)
  door.castShadow = true
  group.add(door)
  
  // Add details based on type
  if (type === 'paneled' || type === 'standard') {
    // Add recessed panels
    const panelInset = 0.01
    const panelMat = material.clone ? material.clone() : material
    if (panelMat.color) {
      panelMat.color = panelMat.color.clone().offsetHSL(0, 0, -0.1)
    }
    
    // Upper panel
    const upperPanel = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.7, height * 0.35, doorDepth + 0.01),
      panelMat
    )
    upperPanel.position.set(0, height * 0.2, panelInset)
    group.add(upperPanel)
    
    // Lower panel
    const lowerPanel = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.7, height * 0.35, doorDepth + 0.01),
      panelMat
    )
    lowerPanel.position.set(0, -height * 0.2, panelInset)
    group.add(lowerPanel)
  }
  
  if (type === 'glassDouble' || type === 'glass') {
    // Add glass inset
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88CCFF,
      transparent: true,
      opacity: 0.3,
      roughness: 0.05,
      metalness: 0.1
    })
    
    const glassPane = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.7, height * 0.5),
      glassMat
    )
    glassPane.position.set(0, height * 0.15, doorDepth / 2 + 0.01)
    group.add(glassPane)
  }
  
  // Door handle
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x8B8B00,
    roughness: 0.3,
    metalness: 0.7
  })
  
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8),
    handleMat
  )
  handle.rotation.x = Math.PI / 2
  handle.position.set(width * 0.35, 0, doorDepth / 2 + 0.02)
  group.add(handle)
  
  return group
}

/**
 * Create arched door (for medieval/fantasy styles)
 * @param {Object} config
 * @returns {THREE.Group}
 */
export function createArchedDoorBay(config) {
  const {
    bayWidth,
    floorHeight,
    doorWidth,
    doorHeight,
    wallDepth,
    wallMaterial,
    trimMaterial,
    doorMaterial,
    archRatio = 0.25
  } = config

  const group = new THREE.Group()
  group.name = 'archedDoorBay'
  
  const headerHeight = floorHeight - doorHeight
  const sideWidth = (bayWidth - doorWidth) / 2
  
  // Header panel
  if (headerHeight > 0.05) {
    const headerPanel = createWallPanel(bayWidth, headerHeight, wallDepth, wallMaterial)
    headerPanel.position.set(bayWidth / 2, doorHeight + headerHeight / 2, 0)
    group.add(headerPanel)
  }
  
  // Side panels
  if (sideWidth > 0.05) {
    const leftPanel = createWallPanel(sideWidth, doorHeight, wallDepth, wallMaterial)
    leftPanel.position.set(sideWidth / 2, doorHeight / 2, 0)
    group.add(leftPanel)
    
    const rightPanel = createWallPanel(sideWidth, doorHeight, wallDepth, wallMaterial)
    rightPanel.position.set(bayWidth - sideWidth / 2, doorHeight / 2, 0)
    group.add(rightPanel)
  }
  
  // Arched door frame
  const archHeight = doorHeight * archRatio
  const rectHeight = doorHeight - archHeight
  
  // Vertical frame pieces
  const frameThickness = 0.1
  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, rectHeight, wallDepth * 0.8),
    trimMaterial
  )
  leftFrame.position.set(bayWidth / 2 - doorWidth / 2 - frameThickness / 2, rectHeight / 2, wallDepth * 0.1)
  group.add(leftFrame)
  
  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, rectHeight, wallDepth * 0.8),
    trimMaterial
  )
  rightFrame.position.set(bayWidth / 2 + doorWidth / 2 + frameThickness / 2, rectHeight / 2, wallDepth * 0.1)
  group.add(rightFrame)
  
  // Arch keystone
  const keystoneGeo = new THREE.BoxGeometry(frameThickness * 1.5, archHeight * 0.4, wallDepth * 0.5)
  const keystone = new THREE.Mesh(keystoneGeo, trimMaterial)
  keystone.position.set(bayWidth / 2, rectHeight + archHeight * 0.6, wallDepth * 0.25)
  group.add(keystone)
  
  // Simple door panel
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth - 0.05, doorHeight - archHeight - 0.05, 0.05),
    doorMaterial
  )
  door.position.set(bayWidth / 2, (doorHeight - archHeight) / 2, -wallDepth * 0.1)
  door.castShadow = true
  group.add(door)
  
  // Step
  const step = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth + 0.3, 0.15, wallDepth + 0.4),
    trimMaterial
  )
  step.position.set(bayWidth / 2, 0.075, wallDepth * 0.2)
  step.castShadow = true
  step.receiveShadow = true
  group.add(step)
  
  return group
}
