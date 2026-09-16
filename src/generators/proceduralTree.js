import * as THREE from 'three'
import { createRNG } from '../runtime/seedRandom'

/**
 * Creates a procedural tree with trunk and foliage
 * @param {Object} params - Generator parameters
 * @param {number} seed - Random seed
 * @param {Object} textures - Optional textures (foliageTexture, barkTexture)
 * @returns {{root: THREE.Group, tick: Function|null, dispose: Function}}
 */
export function createProceduralTree(params, seed, textures = {}) {
  const {
    height = 5,
    trunkRadius = 0.3,
    trunkColor = '#8B4513',
    foliageColor = '#228B22',
    foliageType = 'broadleaf',
    leafCount = 150,
    windSway = true,
    swayAmount = 0.1
  } = params

  const rng = createRNG(seed)
  const group = new THREE.Group()
  group.name = 'proceduralTree'
  
  // Load textures if provided
  const loadedTextures = {}
  const loader = new THREE.TextureLoader()
  
  if (textures.barkTexture) {
    loadedTextures.bark = loader.load(textures.barkTexture)
    loadedTextures.bark.wrapS = loadedTextures.bark.wrapT = THREE.RepeatWrapping
    loadedTextures.bark.repeat.set(1, 2)
  }
  
  if (textures.foliageTexture) {
    loadedTextures.foliage = loader.load(textures.foliageTexture)
    loadedTextures.foliage.colorSpace = THREE.SRGBColorSpace
  }

  // Trunk
  const trunkHeight = height * 0.4
  const trunkGeometry = new THREE.CylinderGeometry(
    trunkRadius * 0.7, // top
    trunkRadius,       // bottom
    trunkHeight,
    8
  )
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: loadedTextures.bark ? 0xffffff : trunkColor,
    map: loadedTextures.bark || null,
    roughness: 0.9,
    metalness: 0
  })
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
  trunk.name = 'trunk'
  trunk.position.y = trunkHeight / 2
  trunk.castShadow = true
  trunk.receiveShadow = true
  group.add(trunk)

  const baseFlare = createBaseFlare(trunkRadius, trunkColor, loadedTextures.bark)
  group.add(baseFlare)

  const rootGroup = new THREE.Group()
  rootGroup.name = 'surface_roots'
  group.add(rootGroup)

  const crownGroup = new THREE.Group()
  crownGroup.name = 'crown_group'
  group.add(crownGroup)
  const animationTargets = {
    upperWhorls: []
  }

  const foliageHeight = height - trunkHeight
  const foliageRadius = height * 0.35

  // Create foliage based on type
  switch (foliageType) {
    case 'cone':
      Object.assign(animationTargets, createPineFoliage(crownGroup, {
        trunkHeight,
        trunkRadius,
        foliageHeight,
        foliageRadius,
        foliageColor,
        leafCount,
        rng,
        barkMaterial: trunkMaterial,
        foliageTexture: loadedTextures.foliage
      }))
      break
    case 'layered':
      createLayeredFoliage(crownGroup, trunkHeight, foliageHeight, foliageRadius, foliageColor, rng, loadedTextures.foliage)
      break
    case 'broadleaf':
      createSurfaceRoots(rootGroup, {
        trunkHeight,
        trunkRadius,
        trunkMaterial,
        rootCount: THREE.MathUtils.clamp(Math.round(leafCount / 80) + 2, 3, 6),
        rng
      })
      createBroadleafFoliage(crownGroup, {
        trunkHeight,
        trunkRadius,
        foliageHeight,
        foliageRadius,
        foliageColor,
        leafCount,
        rng,
        barkMaterial: trunkMaterial,
        foliageTexture: loadedTextures.foliage
      })
      break
    case 'sphere':
    default:
      createSphereFoliage(crownGroup, trunkHeight, foliageHeight, foliageRadius, foliageColor, leafCount, rng, loadedTextures.foliage)
      break
  }

  // Animation tick for wind sway
  let tick = null
  if (windSway) {
    const swayPhase = rng.range(0, Math.PI * 2)
    const upperWhorls = animationTargets.upperWhorls
    tick = (time) => {
      const primaryLean = Math.sin(time * 0.9 + swayPhase) * swayAmount * 0.42
      const primaryCross = Math.cos(time * 0.68 + swayPhase * 0.7) * swayAmount * 0.22
      const crownFollow = Math.sin(time * 1.15 + swayPhase + 0.4) * swayAmount * 0.08

      group.rotation.z = primaryLean
      group.rotation.x = primaryCross
      // Broadleaf forks attach at several trunk heights. A separate ground-origin
      // crown rotation would tear those junctions apart; use the shared root sway.
      crownGroup.rotation.z = foliageType === 'broadleaf' ? 0 : primaryLean * 0.35 + crownFollow
      crownGroup.rotation.x = foliageType === 'broadleaf' ? 0 : primaryCross * 0.45

      upperWhorls.forEach((whorl, index) => {
        const drift = Math.sin(time * 1.08 + swayPhase + index * 0.16) * swayAmount * 0.05
        whorl.rotation.z = drift
        whorl.rotation.x = drift * 0.4
      })
    }
  }

  // Cleanup
  function dispose() {
    // Lobes, branches and roots share resources; release each allocation once.
    const resources = new Set(Object.values(loadedTextures))
    group.traverse((child) => {
      if (child.geometry) resources.add(child.geometry)
      if (child.material) resources.add(child.material)
    })
    resources.forEach(resource => resource.dispose())
  }

  return { root: group, tick, dispose }
}

function createBaseFlare(trunkRadius, trunkColor, barkTexture = null) {
  const geometry = new THREE.CylinderGeometry(trunkRadius * 1.15, trunkRadius * 1.45, trunkRadius * 0.9, 8)
  const material = new THREE.MeshStandardMaterial({
    color: barkTexture ? 0xffffff : trunkColor,
    map: barkTexture || null,
    roughness: 0.92,
    metalness: 0
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'base_flare'
  mesh.position.y = geometry.parameters.height / 2 - trunkRadius * 0.18
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function createSurfaceRoots(parent, { trunkHeight, trunkRadius, trunkMaterial, rootCount, rng }) {
  const rootMaterial = trunkMaterial.clone()

  for (let i = 0; i < rootCount; i++) {
    const rootLength = trunkRadius * rng.range(1.8, 2.8)
    const rootGeometry = new THREE.CylinderGeometry(trunkRadius * 0.12, trunkRadius * 0.22, rootLength, 5)
    rootGeometry.translate(0, rootLength / 2, 0)
    const root = new THREE.Mesh(rootGeometry, rootMaterial)
    const angle = (i / rootCount) * Math.PI * 2 + rng.range(-0.2, 0.2)
    root.name = `surface_root_${i}`
    root.position.set(
      Math.cos(angle) * trunkRadius * 0.45,
      trunkRadius * 0.12,
      Math.sin(angle) * trunkRadius * 0.45
    )
    root.rotation.set(Math.PI / 2 + rng.range(0.15, 0.32), angle, rng.range(-0.08, 0.08))
    root.castShadow = true
    root.receiveShadow = true
    parent.add(root)
  }
}

function createSphereFoliage(parent, trunkHeight, height, radius, color, leafCount, rng, foliageTexture = null) {
  parent.position.y = trunkHeight

  // Main foliage sphere
  const mainGeometry = new THREE.SphereGeometry(radius, 16, 12)
  const mainMaterial = new THREE.MeshStandardMaterial({
    color: foliageTexture ? 0xffffff : color,
    map: foliageTexture || null,
    roughness: 0.8,
    metalness: 0
  })
  const main = new THREE.Mesh(mainGeometry, mainMaterial)
  main.name = 'canopy_lobe_primary'
  main.position.y = height * 0.5
  main.scale.y = 0.8
  main.castShadow = true
  parent.add(main)

  // Add some smaller clusters for detail
  const clusterCount = THREE.MathUtils.clamp(Math.round(leafCount / 90) + 1, 3, 6)
  for (let i = 0; i < clusterCount; i++) {
    const angle = (i / clusterCount) * Math.PI * 2 + rng.range(-0.3, 0.3)
    const clusterRadius = radius * rng.range(0.4, 0.6)
    const clusterGeometry = new THREE.SphereGeometry(clusterRadius, 8, 6)
    const cluster = new THREE.Mesh(clusterGeometry, mainMaterial)
    cluster.name = `canopy_lobe_${i}`
    
    cluster.position.set(
      Math.cos(angle) * radius * 0.7,
      height * rng.range(0.3, 0.7),
      Math.sin(angle) * radius * 0.7
    )
    cluster.castShadow = true
    parent.add(cluster)
  }
}

function createConeFoliage(parent, trunkHeight, height, radius, color, foliageTexture = null) {
  parent.position.y = trunkHeight

  const coneGeometry = new THREE.ConeGeometry(radius, height, 8)
  const material = new THREE.MeshStandardMaterial({
    color: foliageTexture ? 0xffffff : color,
    map: foliageTexture || null,
    roughness: 0.8,
    metalness: 0
  })
  const cone = new THREE.Mesh(coneGeometry, material)
  cone.name = 'canopy_lobe_primary'
  cone.position.y = height / 2
  cone.castShadow = true
  parent.add(cone)
}

function createPineFoliage(parent, config) {
  const {
    trunkHeight,
    trunkRadius,
    foliageHeight,
    foliageRadius,
    foliageColor,
    leafCount,
    rng,
    barkMaterial,
    foliageTexture
  } = config

  parent.position.y = 0

  const branchMaterial = barkMaterial.clone()
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: foliageTexture ? 0xffffff : foliageColor,
    map: foliageTexture || null,
    roughness: 0.82,
    metalness: 0,
    flatShading: true
  })

  const leaderHeight = foliageHeight * 0.4
  const leaderGeometry = new THREE.CylinderGeometry(trunkRadius * 0.2, trunkRadius * 0.38, leaderHeight, 5)
  const leader = new THREE.Mesh(leaderGeometry, branchMaterial)
  leader.name = 'leader_tip'
  leader.position.y = trunkHeight + leaderHeight * 0.5
  leader.castShadow = true
  leader.receiveShadow = true
  parent.add(leader)

  const whorlCount = THREE.MathUtils.clamp(Math.round(leafCount / 65) + 1, 4, 6)
  const whorlHeights = buildPineWhorlHeights(trunkHeight, foliageHeight, whorlCount, rng)
  const upperWhorls = []

  whorlHeights.forEach((whorlHeight, whorlIndex) => {
    const progress = whorlIndex / Math.max(1, whorlHeights.length - 1)
    const isLowerWhorl = progress <= 0.35
    const isUpperWhorl = progress >= 0.62
    const branchCount = isLowerWhorl ? 4 : isUpperWhorl ? 2 : 3
    const spreadRadius = foliageRadius * (
      1.12
      - progress * 0.58
      - progress * progress * 0.12
      + rng.range(-0.03, 0.04)
    )
    const branchLength = spreadRadius * rng.range(isLowerWhorl ? 0.98 : 0.88, isLowerWhorl ? 1.14 : 1.0)
    const whorl = new THREE.Group()
    whorl.name = `pine_whorl_${whorlIndex}`
    whorl.position.y = whorlHeight
    parent.add(whorl)
    if (isUpperWhorl) {
      upperWhorls.push(whorl)
    }

    for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
      const angle = (branchIndex / branchCount) * Math.PI * 2 + rng.range(-0.22, 0.22) + whorlIndex * 0.12
      const branch = createPineBranch({
        trunkRadius,
        branchLength: branchLength * rng.range(0.9, 1.08),
        branchRadius: trunkRadius * rng.range(0.14, 0.2),
        angle,
        crownProgress: progress,
        branchMaterial,
        foliageMaterial,
        spreadRadius,
        rng,
        namePrefix: isLowerWhorl ? 'drooping_lower_branch' : 'pine_branch',
        padIndexBase: whorlIndex * 10 + branchIndex * 2
      })
      whorl.add(branch)
    }
  })

  return { upperWhorls }
}

function buildPineWhorlHeights(trunkHeight, foliageHeight, whorlCount, rng) {
  const heights = []
  let cursor = trunkHeight * 0.62

  for (let i = 0; i < whorlCount; i++) {
    heights.push(cursor)
    const remaining = whorlCount - i - 1
    if (remaining <= 0) {
      break
    }

    const progress = i / Math.max(1, whorlCount - 1)
    const minGap = foliageHeight * (0.12 + progress * 0.03)
    const maxGap = foliageHeight * (0.19 + progress * 0.06)
    cursor += rng.range(minGap, maxGap)
  }

  return heights
}

function createPineBranch(config) {
  const {
    trunkRadius,
    branchLength,
    branchRadius,
    angle,
    crownProgress,
    branchMaterial,
    foliageMaterial,
    spreadRadius,
    rng,
    namePrefix,
    padIndexBase
  } = config

  const branchGroup = new THREE.Group()
  const branchGeometry = new THREE.CylinderGeometry(branchRadius * 0.28, branchRadius, branchLength, 5)
  branchGeometry.translate(0, branchLength / 2, 0)
  const branch = new THREE.Mesh(branchGeometry, branchMaterial)
  branch.name = `${namePrefix}_${padIndexBase}`
  branch.position.set(
    Math.cos(angle) * trunkRadius * 0.25,
    0,
    Math.sin(angle) * trunkRadius * 0.25
  )
  branch.rotation.set(
    crownProgress <= 0.35 ? rng.range(0.2, 0.34) : rng.range(-0.04, 0.12),
    angle,
    crownProgress <= 0.35 ? rng.range(-1.24, -1.08) : rng.range(-1.02, -0.86)
  )
  branch.castShadow = true
  branch.receiveShadow = true
  branchGroup.add(branch)

  const padCount = crownProgress >= 0.68 ? 1 : 2
  const padPositions = padCount === 1 ? [0.82] : [0.58, 0.84]
  for (let padIndex = 0; padIndex < padCount; padIndex++) {
    const t = padPositions[padIndex]
    const lateralOffset = (padIndex - (padCount - 1) / 2) * spreadRadius * (crownProgress <= 0.35 ? 0.16 : 0.1)
    const pad = createNeedlePad({
      radius: spreadRadius * (padIndex === 0 ? 0.38 - crownProgress * 0.08 : 0.26 - crownProgress * 0.05) * rng.range(0.94, 1.06),
      height: spreadRadius * (padIndex === 0 ? 0.24 : 0.18) * rng.range(0.92, 1.04),
      material: foliageMaterial,
      angle: angle + rng.range(-0.22, 0.22),
      index: padIndexBase + padIndex
    })
    pad.position.set(
      Math.cos(angle) * branchLength * t - Math.sin(angle) * lateralOffset,
      branchLength * (0.08 + padIndex * 0.06 + (1 - crownProgress) * 0.05),
      Math.sin(angle) * branchLength * t + Math.cos(angle) * lateralOffset
    )
    pad.rotation.y = angle + rng.range(-0.15, 0.15)
    branchGroup.add(pad)
  }

  return branchGroup
}

function createNeedlePad({ radius, height, material, angle, index }) {
  const geometry = new THREE.ConeGeometry(radius, height, 6)
  const pad = new THREE.Mesh(geometry, material)
  pad.name = `needle_pad_${index}`
  pad.rotation.z = Math.sin(angle) * 0.08
  pad.castShadow = true
  pad.receiveShadow = true
  return pad
}

function createLayeredFoliage(parent, trunkHeight, height, radius, color, rng, foliageTexture = null) {
  parent.position.y = trunkHeight

  const material = new THREE.MeshStandardMaterial({
    color: foliageTexture ? 0xffffff : color,
    map: foliageTexture || null,
    roughness: 0.8,
    metalness: 0,
    side: THREE.DoubleSide
  })

  const layers = 4
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1)
    const layerRadius = radius * (1 - t * 0.4)
    const layerY = t * height
    
    const coneGeometry = new THREE.ConeGeometry(layerRadius, height / layers * 1.5, 8)
    const layer = new THREE.Mesh(coneGeometry, material)
    layer.name = i === 0 ? 'canopy_lobe_primary' : `canopy_lobe_${i}`
    layer.position.y = layerY + height / layers * 0.3
    layer.rotation.y = rng.range(0, Math.PI / 4)
    layer.castShadow = true
    parent.add(layer)
  }
}

function createBroadleafFoliage(parent, config) {
  const {
    trunkHeight,
    trunkRadius,
    foliageHeight,
    foliageRadius,
    foliageColor,
    leafCount,
    rng,
    barkMaterial,
    foliageTexture
  } = config

  const branchCount = THREE.MathUtils.clamp(Math.round(leafCount / 55) + 3, 4, 9)
  const upperCount = THREE.MathUtils.clamp(Math.floor(leafCount / 140) + 3, 3, 6)
  const branchMaterial = barkMaterial.clone()
  // A small palette preserves the supplied hue (including non-green trees).
  // Textures retain their original white tint, as in the other foliage modes.
  const canopyMaterials = [0.86, 1, 1.1].map(brightness => new THREE.MeshStandardMaterial({
    color: foliageTexture ? 0xffffff : new THREE.Color(foliageColor).multiplyScalar(brightness),
    map: foliageTexture || null,
    roughness: 0.88,
    metalness: 0,
    flatShading: true
  }))
  // Closed triangular lobes, shared across the crown. No independent jitter of
  // duplicated vertices: UV seams and triangle edges must remain watertight.
  const lobeGeometry = new THREE.IcosahedronGeometry(1, 2)
  let lobeIndex = 0
  function addLobe(center, width, depth, rise, shade) {
    const lobe = new THREE.Mesh(lobeGeometry, canopyMaterials[shade])
    lobe.name = lobeIndex === 0 ? 'canopy_lobe_primary' : `canopy_lobe_${lobeIndex}`
    lobeIndex += 1
    lobe.position.copy(center)
    lobe.scale.set(width, rise, depth)
    lobe.rotation.y = rng.range(0, Math.PI * 2)
    lobe.castShadow = true
    lobe.receiveShadow = true
    parent.add(lobe)
    return lobe
  }

  // The central volume hides the trunk cap and bridges every outer mass.
  addLobe(new THREE.Vector3(0, trunkHeight + foliageHeight * 0.33, 0),
    foliageRadius * 0.72, foliageRadius * 0.69, foliageHeight * 0.4, 0)
  addLobe(new THREE.Vector3(foliageRadius * 0.08, trunkHeight + foliageHeight * 0.71, -foliageRadius * 0.06),
    foliageRadius * 0.53, foliageRadius * 0.5, foliageHeight * 0.28, 2)

  const phase = rng.range(0, Math.PI * 2)
  for (let i = 0; i < branchCount; i++) {
    const angle = phase + (i / branchCount) * Math.PI * 2 + rng.range(-0.16, 0.16)
    const spread = foliageRadius * rng.range(0.52, 0.65)
    const tip = new THREE.Vector3(
      Math.cos(angle) * spread,
      trunkHeight + foliageHeight * rng.range(0.25, 0.42),
      Math.sin(angle) * spread
    )
    addLobe(tip, foliageRadius * rng.range(0.46, 0.55),
      foliageRadius * rng.range(0.44, 0.54), foliageHeight * rng.range(0.24, 0.29), i % 2)

    const base = new THREE.Vector3(0, trunkHeight * rng.range(0.6, 0.9), 0)
    const direction = tip.clone().sub(base)
    const branchLength = direction.length()
    const branchRadius = trunkRadius * rng.range(0.28, 0.4)
    const branchGeometry = new THREE.CylinderGeometry(branchRadius * 0.16, branchRadius, branchLength, 6)
    branchGeometry.translate(0, branchLength / 2, 0)
    const branch = new THREE.Mesh(branchGeometry, branchMaterial)
    branch.name = `branch_segment_${i}`
    branch.position.copy(base)
    // Use the same endpoint for the cylinder axis and supporting foliage.
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    branch.castShadow = true
    branch.receiveShadow = true
    parent.add(branch)
  }

  // Stagger the upper tier to soften the radial lower ring into a layered crown.
  for (let i = 0; i < upperCount; i++) {
    const angle = phase + (i + 0.5) / upperCount * Math.PI * 2
    const spread = foliageRadius * rng.range(0.36, 0.48)
    addLobe(new THREE.Vector3(
      Math.cos(angle) * spread,
      trunkHeight + foliageHeight * rng.range(0.59, 0.69),
      Math.sin(angle) * spread
    ), foliageRadius * rng.range(0.4, 0.48), foliageRadius * rng.range(0.39, 0.47),
    foliageHeight * rng.range(0.23, 0.28), 1 + i % 2)
  }
}
