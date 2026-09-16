/**
 * Window Module Generators
 * Creates window assemblies using additive construction (no boolean cuts)
 */
import * as THREE from 'three'
import { createWallPanel } from './wallModules.js'

/**
 * Create a window bay using ADDITIVE ASSEMBLY
 * Builds wall panels AROUND the window opening, not by cutting holes
 * 
 * @param {Object} config - Window configuration
 * @param {number} config.bayWidth - Total width of the bay
 * @param {number} config.floorHeight - Total height of the floor
 * @param {number} config.windowWidth - Width of window opening
 * @param {number} config.windowHeight - Height of window opening
 * @param {number} config.sillHeight - Height from floor to window bottom
 * @param {number} config.wallDepth - Wall thickness
 * @param {THREE.Material} config.wallMaterial - Material for wall panels
 * @param {THREE.Material} config.trimMaterial - Material for window frame
 * @param {THREE.Material} config.glassMaterial - Material for glass
 * @param {string} config.windowType - Type of window (casement, grid, curtainWall, etc.)
 * @returns {THREE.Group}
 */
export function createWindowBay(config) {
  const {
    bayWidth,
    floorHeight,
    windowWidth,
    windowHeight,
    sillHeight,
    wallDepth,
    wallMaterial,
    trimMaterial,
    glassMaterial,
    windowType = 'standard'
  } = config

  const group = new THREE.Group()
  group.name = 'windowBay'
  
  // Calculate panel dimensions
  const headerHeight = floorHeight - sillHeight - windowHeight
  const sideWidth = (bayWidth - windowWidth) / 2
  
  // ===== ADDITIVE ASSEMBLY: Build wall panels around opening =====
  
  // Bottom sill panel (below window)
  if (sillHeight > 0.05) {
    const sillPanel = createWallPanel(bayWidth, sillHeight, wallDepth, wallMaterial)
    sillPanel.position.set(bayWidth / 2, sillHeight / 2, 0)
    group.add(sillPanel)
  }
  
  // Top header panel (above window)
  if (headerHeight > 0.05) {
    const headerPanel = createWallPanel(bayWidth, headerHeight, wallDepth, wallMaterial)
    headerPanel.position.set(bayWidth / 2, sillHeight + windowHeight + headerHeight / 2, 0)
    group.add(headerPanel)
  }
  
  // Left side panel
  if (sideWidth > 0.05) {
    const leftPanel = createWallPanel(sideWidth, windowHeight, wallDepth, wallMaterial)
    leftPanel.position.set(sideWidth / 2, sillHeight + windowHeight / 2, 0)
    group.add(leftPanel)
  }
  
  // Right side panel
  if (sideWidth > 0.05) {
    const rightPanel = createWallPanel(sideWidth, windowHeight, wallDepth, wallMaterial)
    rightPanel.position.set(bayWidth - sideWidth / 2, sillHeight + windowHeight / 2, 0)
    group.add(rightPanel)
  }
  
  // ===== WINDOW FRAME + GLASS (in the opening) =====
  const windowGroup = createWindowFrame({
    width: windowWidth,
    height: windowHeight,
    trimMaterial,
    glassMaterial,
    type: windowType,
    insetDepth: wallDepth * 0.3
  })
  windowGroup.position.set(bayWidth / 2, sillHeight + windowHeight / 2, wallDepth * 0.1)
  group.add(windowGroup)
  
  // Decorative sill ledge
  const ledgeGeo = new THREE.BoxGeometry(windowWidth + 0.1, 0.05, wallDepth + 0.08)
  const ledge = new THREE.Mesh(ledgeGeo, trimMaterial)
  ledge.position.set(bayWidth / 2, sillHeight - 0.025, wallDepth * 0.04)
  ledge.castShadow = true
  group.add(ledge)
  
  return group
}

/**
 * Create the actual window frame and glass
 * @param {Object} config
 * @returns {THREE.Group}
 */
export function createWindowFrame(config) {
  const {
    width,
    height,
    trimMaterial,
    glassMaterial,
    type = 'standard',
    insetDepth = 0.1
  } = config

  const group = new THREE.Group()
  group.name = 'windowFrame'
  
  const frameThickness = 0.05
  
  // Outer frame (4 pieces)
  const topFrame = new THREE.Mesh(
    new THREE.BoxGeometry(width, frameThickness, frameThickness),
    trimMaterial
  )
  topFrame.position.set(0, height / 2 - frameThickness / 2, 0)
  group.add(topFrame)
  
  const bottomFrame = new THREE.Mesh(
    new THREE.BoxGeometry(width, frameThickness, frameThickness),
    trimMaterial
  )
  bottomFrame.position.set(0, -height / 2 + frameThickness / 2, 0)
  group.add(bottomFrame)
  
  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height - frameThickness * 2, frameThickness),
    trimMaterial
  )
  leftFrame.position.set(-width / 2 + frameThickness / 2, 0, 0)
  group.add(leftFrame)
  
  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height - frameThickness * 2, frameThickness),
    trimMaterial
  )
  rightFrame.position.set(width / 2 - frameThickness / 2, 0, 0)
  group.add(rightFrame)
  
  // Add mullions based on window type
  if (type === 'grid' || type === 'gridWindow') {
    // Horizontal mullion
    const hMullion = new THREE.Mesh(
      new THREE.BoxGeometry(width - frameThickness * 2, frameThickness * 0.6, frameThickness * 0.6),
      trimMaterial
    )
    hMullion.position.set(0, 0, 0)
    group.add(hMullion)
    
    // Vertical mullion
    const vMullion = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness * 0.6, height - frameThickness * 2, frameThickness * 0.6),
      trimMaterial
    )
    vMullion.position.set(0, 0, 0)
    group.add(vMullion)
  } else if (type === 'casement') {
    // Single vertical mullion for casement
    const mullion = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness * 0.6, height - frameThickness * 2, frameThickness * 0.6),
      trimMaterial
    )
    mullion.position.set(0, 0, 0)
    group.add(mullion)
  } else if (type === 'curtainWall') {
    // Multiple vertical mullions for curtain wall
    const mullionCount = Math.max(2, Math.floor(width / 0.6))
    const spacing = width / (mullionCount + 1)
    for (let i = 1; i <= mullionCount; i++) {
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness * 0.4, height - frameThickness * 2, frameThickness * 0.4),
        trimMaterial
      )
      mullion.position.set(-width / 2 + spacing * i, 0, 0)
      group.add(mullion)
    }
  }
  
  // Glass pane (slightly inset)
  const glassWidth = width - frameThickness * 2
  const glassHeight = height - frameThickness * 2
  const glassGeo = new THREE.PlaneGeometry(glassWidth, glassHeight)
  const glass = new THREE.Mesh(glassGeo, glassMaterial)
  glass.position.z = -insetDepth * 0.3
  group.add(glass)
  
  return group
}

/**
 * Create arched window (for fantasy/medieval styles)
 * @param {Object} config
 * @returns {THREE.Group}
 */
export function createArchedWindow(config) {
  const {
    width,
    height,
    trimMaterial,
    glassMaterial,
    archRatio = 0.3 // How much of height is arch
  } = config

  const group = new THREE.Group()
  group.name = 'archedWindow'
  
  const frameThickness = 0.06
  const archHeight = height * archRatio
  const rectHeight = height - archHeight
  
  // Rectangular portion frame
  const bottomFrame = new THREE.Mesh(
    new THREE.BoxGeometry(width, frameThickness, frameThickness),
    trimMaterial
  )
  bottomFrame.position.set(0, -height / 2 + frameThickness / 2, 0)
  group.add(bottomFrame)
  
  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, rectHeight, frameThickness),
    trimMaterial
  )
  leftFrame.position.set(-width / 2 + frameThickness / 2, -height / 2 + rectHeight / 2 + frameThickness, 0)
  group.add(leftFrame)
  
  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, rectHeight, frameThickness),
    trimMaterial
  )
  rightFrame.position.set(width / 2 - frameThickness / 2, -height / 2 + rectHeight / 2 + frameThickness, 0)
  group.add(rightFrame)
  
  // Arch top (simplified as half-cylinder)
  const archGeo = new THREE.CylinderGeometry(
    width / 2 - frameThickness,
    width / 2 - frameThickness,
    frameThickness,
    16,
    1,
    false,
    0,
    Math.PI
  )
  const arch = new THREE.Mesh(archGeo, trimMaterial)
  arch.rotation.x = Math.PI / 2
  arch.rotation.z = Math.PI / 2
  arch.position.set(0, -height / 2 + rectHeight + frameThickness, 0)
  group.add(arch)
  
  // Glass (rectangular + semicircle approximated as rectangle for simplicity)
  const glassGeo = new THREE.PlaneGeometry(width - frameThickness * 2, height - frameThickness * 2)
  const glass = new THREE.Mesh(glassGeo, glassMaterial)
  glass.position.z = -0.02
  group.add(glass)
  
  return group
}

/**
 * Create shuttered window (for coastal style)
 * @param {Object} config
 * @returns {THREE.Group}
 */
export function createShutteredWindow(config) {
  const {
    width,
    height,
    trimMaterial,
    glassMaterial,
    shutterMaterial
  } = config

  const group = createWindowFrame({
    width,
    height,
    trimMaterial,
    glassMaterial,
    type: 'casement'
  })
  group.name = 'shutteredWindow'
  
  // Add shutters on sides
  const shutterWidth = width * 0.25
  const shutterHeight = height + 0.1
  const shutterThickness = 0.03
  
  // Left shutter
  const leftShutter = new THREE.Mesh(
    new THREE.BoxGeometry(shutterWidth, shutterHeight, shutterThickness),
    shutterMaterial || trimMaterial
  )
  leftShutter.position.set(-width / 2 - shutterWidth / 2 - 0.02, 0, 0.02)
  group.add(leftShutter)
  
  // Right shutter
  const rightShutter = new THREE.Mesh(
    new THREE.BoxGeometry(shutterWidth, shutterHeight, shutterThickness),
    shutterMaterial || trimMaterial
  )
  rightShutter.position.set(width / 2 + shutterWidth / 2 + 0.02, 0, 0.02)
  group.add(rightShutter)
  
  return group
}
