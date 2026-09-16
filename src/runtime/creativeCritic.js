import * as THREE from 'three'

import { getAssetFamilyBucket } from '../services/assetFamily'

function summarizeMeshes(root) {
  const materialIds = new Set()
  let meshCount = 0
  let instancedMeshCount = 0
  let regularMeshCount = 0

  root.traverse(child => {
    if (child.isMesh) {
      meshCount += 1
      if (child.isInstancedMesh) {
        instancedMeshCount += 1
      } else {
        regularMeshCount += 1
      }

      if (Array.isArray(child.material)) {
        child.material.forEach(material => materialIds.add(material.uuid))
      } else if (child.material) {
        materialIds.add(child.material.uuid)
      }
    }
  })

  return {
    meshCount,
    instancedMeshCount,
    regularMeshCount,
    materialCount: materialIds.size
  }
}

const INSTANCE_SAMPLE_CAP = 96

function collectMeshSamples(root) {
  const samples = []

  root.updateMatrixWorld(true)

  const pushSample = (mesh, box) => {
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    if (!Number.isFinite(size.x + size.y + size.z)) {
      return
    }

    samples.push({
      mesh,
      box,
      center,
      size,
      footprint: Math.max(size.x, size.z),
      volumeHint: size.x * size.y * size.z
    })
  }

  root.traverse(child => {
    if (!child.isMesh) {
      return
    }

    if (!child.geometry?.boundingBox) {
      child.geometry?.computeBoundingBox?.()
    }

    if (!child.geometry?.boundingBox) {
      return
    }

    if (child.isInstancedMesh && child.count > 0) {
      // geometry.boundingBox alone would collapse the whole batch to a single
      // blob at the mesh origin; measure the real instance placements instead.
      const stride = Math.max(1, Math.ceil(child.count / INSTANCE_SAMPLE_CAP))
      const instanceMatrix = new THREE.Matrix4()
      for (let i = 0; i < child.count; i += stride) {
        child.getMatrixAt(i, instanceMatrix)
        const box = child.geometry.boundingBox
          .clone()
          .applyMatrix4(instanceMatrix)
          .applyMatrix4(child.matrixWorld)
        pushSample(child, box)
      }
      return
    }

    pushSample(child, child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld))
  })

  return samples
}

function isBranchLike(sample) {
  const maxDim = Math.max(sample.size.x, sample.size.y, sample.size.z)
  const minDim = Math.max(0.001, Math.min(sample.size.x, sample.size.y, sample.size.z))
  return maxDim >= minDim * 2
}

// Gnarled or curved trunks are often built from stacked short segments; merge
// grounded, co-axial bark pieces into one measurable column before judging.
function mergeTrunkColumn(samples, size) {
  const groundLimit = Math.max(0.35, size.y * 0.1)
  const seeds = samples.filter(sample =>
    sample.box.min.y <= groundLimit &&
    sample.size.y >= sample.footprint * 0.6 &&
    sample.footprint <= Math.max(size.x, size.z) * 0.5
  )

  let best = null

  for (const seed of seeds) {
    const pieces = [seed]
    const unionBox = seed.box.clone()
    let top = seed.box.max.y
    const rest = samples
      .filter(sample => sample !== seed)
      .sort((a, b) => a.box.min.y - b.box.min.y)

    for (const sample of rest) {
      if (sample.footprint > seed.footprint * 2.2) continue
      const dx = sample.center.x - seed.center.x
      const dz = sample.center.z - seed.center.z
      const lateral = Math.sqrt(dx * dx + dz * dz)
      if (lateral > seed.footprint * 0.9 + sample.footprint * 0.5) continue
      if (sample.box.min.y - top > Math.max(0.3, sample.size.y * 0.35)) continue
      if (sample.box.max.y <= top) continue
      pieces.push(sample)
      unionBox.union(sample.box)
      top = sample.box.max.y
    }

    if (pieces.length < 2) continue

    const height = top - unionBox.min.y
    if (best && height <= best.size.y) continue

    // The ground segment is the representative column width; absorbed upper
    // pieces (branch stubs, thinner segments) must not inflate the footprint.
    const footprint = seed.footprint
    best = {
      mesh: seed.mesh,
      box: unionBox,
      center: new THREE.Vector3(seed.center.x, unionBox.min.y + height / 2, seed.center.z),
      size: new THREE.Vector3(footprint, height, footprint),
      footprint,
      volumeHint: footprint * height * footprint,
      pieces
    }
  }

  return best
}

const CONIFER_HINT = /\b(pine|pines|spruce|fir|firs|conifer|coniferous|cedar|redwood|sequoia|cypress|hemlock|larch|evergreen|christmas)\b/i
const BROADLEAF_HINT = /\b(oak|oaks|maple|birch|willow|elm|beech|aspen|acacia|baobab|banyan|magnolia|jacaranda|palm|broadleaf|deciduous)\b/i

function looksConiferous(prompt, canopyCandidates) {
  if (prompt) {
    if (BROADLEAF_HINT.test(prompt)) return false
    if (CONIFER_HINT.test(prompt)) return true
  }
  if (canopyCandidates.length === 0) return false
  const coneCount = canopyCandidates.filter(sample => sample.mesh?.geometry?.type?.startsWith('Cone')).length
  return coneCount >= Math.ceil(canopyCandidates.length / 2)
}

function evaluateTreeStructure(root, size, prompt = '') {
  const samples = collectMeshSamples(root)
  const reasons = []
  const fmt = n => Number(n.toFixed(2))

  if (samples.length === 0) {
    return ['Tree asset has no readable meshes.']
  }

  const trunkCandidates = samples.filter(sample => {
    const horizontal = Math.max(sample.size.x, sample.size.z)
    return sample.size.y >= Math.max(0.35, horizontal * 1.6) && sample.center.y <= size.y * 0.75
  })

  let trunk = trunkCandidates.sort((a, b) => b.size.y - a.size.y)[0]
  // Column merging exists to rescue segmented/gnarled trunks from false
  // "missing or too short" verdicts — never to replace an adequate trunk.
  if (!trunk || trunk.size.y < size.y * 0.3) {
    const merged = mergeTrunkColumn(samples, size)
    if (merged && (!trunk || merged.size.y > trunk.size.y)) {
      trunk = merged
    }
  }

  if (!trunk) {
    reasons.push('Tree asset needs an obvious trunk or main stem (no grounded, weight-bearing bark column found).')
    return reasons
  }

  const trunkPieces = new Set(trunk.pieces || [])

  const canopyCandidates = samples.filter(sample => {
    if (sample === trunk || trunkPieces.has(sample)) {
      return false
    }

    const isUpper = sample.center.y >= trunk.center.y + trunk.size.y * 0.15
    const isReadableMass = sample.footprint >= trunk.footprint * 1.35 || sample.volumeHint >= trunk.volumeHint * 0.45
    return isUpper && isReadableMass
  })

  if (canopyCandidates.length === 0) {
    reasons.push(`Tree asset needs readable canopy masses attached above the trunk (${samples.length} meshes found, none reads as a foliage mass above trunk mid-height).`)
    return reasons
  }

  const canopySet = new Set(canopyCandidates)
  const branchLike = samples.filter(sample =>
    sample !== trunk && !trunkPieces.has(sample) && !canopySet.has(sample) && isBranchLike(sample)
  )

  const canopyWidth = Math.max(...canopyCandidates.map(sample => sample.footprint))
  const canopyHeight = Math.max(...canopyCandidates.map(sample => sample.size.y))

  let worstOffender = null
  const supportedCanopies = canopyCandidates.filter(sample => {
    const dx = sample.center.x - trunk.center.x
    const dz = sample.center.z - trunk.center.z
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz)
    const supportReach = trunk.footprint * 1.15 + sample.footprint * 0.72
    const verticalGap = sample.box.min.y - trunk.box.max.y

    if (horizontalDistance <= supportReach && verticalGap <= sample.size.y * 0.45) {
      return true
    }

    // A mass held up by visible branch geometry is attached, even far from the trunk axis.
    const pad = Math.max(0.15, Math.min(sample.size.x, sample.size.z) * 0.12)
    const expanded = sample.box.clone().expandByScalar(pad)
    const branchContact = branchLike.some(branch =>
      branch.box.min.y <= sample.center.y && expanded.intersectsBox(branch.box)
    )
    if (branchContact) {
      return true
    }

    if (!worstOffender || horizontalDistance > worstOffender.distance) {
      worstOffender = { distance: horizontalDistance, reach: supportReach }
    }
    return false
  })

  const unsupported = canopyCandidates.length - supportedCanopies.length
  const offenderDetail = worstOffender
    ? ` (worst mass sits ${fmt(worstOffender.distance)}u from the trunk axis vs ${fmt(worstOffender.reach)}u reach, with no branch geometry touching it)`
    : ''

  if (supportedCanopies.length === 0) {
    reasons.push(`Tree canopy masses appear detached or floating away from the trunk; 0 of ${canopyCandidates.length} masses touch the trunk's reach or any branch${offenderDetail}. Anchor each mass to the trunk or a branch that visibly reaches it.`)
  } else if (unsupported > Math.floor(canopyCandidates.length / 2)) {
    reasons.push(`Tree canopy attachment is weak; ${unsupported} of ${canopyCandidates.length} canopy masses read as detached from trunk or branches${offenderDetail}. Anchor each mass to the trunk or a branch that visibly reaches it.`)
  }

  const trunkRatio = trunk.size.y / Math.max(size.y, 0.001)
  if (trunkRatio < 0.3) {
    reasons.push(`Tree trunk is too short to support the overall canopy silhouette (trunk height ${fmt(trunk.size.y)}u is ${Math.round(trunkRatio * 100)}% of the ${fmt(size.y)}u tree; aim for at least ~30% of height in visible, weight-bearing trunk).`)
  }

  if (canopyWidth > trunk.footprint * 6.5 && trunkRatio < 0.36) {
    reasons.push(`Tree reads like a sphere-blob canopy instead of a supported trunk-and-branch structure (canopy width ${fmt(canopyWidth)}u vs trunk footprint ${fmt(trunk.footprint)}u).`)
  }

  if (canopyHeight > size.y * 0.72 && canopyCandidates.length <= 2) {
    reasons.push(`Tree canopy should break into a few attached masses rather than one oversized blob (largest mass spans ${fmt(canopyHeight)}u of the ${fmt(size.y)}u tree).`)
  }

  // Silhouette rules below assume conifer morphology; a domed broadleaf crown
  // (oak, maple) is centered by nature and must not be judged by them.
  if (canopyCandidates.length >= 3 && looksConiferous(prompt, canopyCandidates)) {
    const branchSupports = samples.filter(sample => {
      if (sample === trunk || trunkPieces.has(sample) || canopySet.has(sample)) {
        return false
      }

      return sample.size.y >= sample.footprint * 1.25 && sample.volumeHint < canopyWidth * canopyHeight * 0.22
    })

    const orderedCanopies = [...canopyCandidates].sort((a, b) => a.center.y - b.center.y)
    const canopyGaps = orderedCanopies.slice(1).map((sample, index) => sample.center.y - orderedCanopies[index].center.y)
    const minGap = Math.min(...canopyGaps)
    const maxGap = Math.max(...canopyGaps)
    const uniformSpacing = maxGap - minGap < size.y * 0.08
    const centeredTiers = orderedCanopies.filter(sample => {
      const dx = sample.center.x - trunk.center.x
      const dz = sample.center.z - trunk.center.z
      return Math.sqrt(dx * dx + dz * dz) < sample.footprint * 0.22
    })
    const centerClustered = orderedCanopies.filter(sample => {
      const dx = sample.center.x - trunk.center.x
      const dz = sample.center.z - trunk.center.z
      return Math.sqrt(dx * dx + dz * dz) < canopyWidth * 0.55
    })
    const widthRatios = orderedCanopies.slice(1).map((sample, index) => sample.footprint / Math.max(orderedCanopies[index].footprint, 0.001))
    const weakTaper = widthRatios.filter(ratio => ratio > 0.88).length >= Math.max(1, widthRatios.length - 1)
    const lowerCanopies = orderedCanopies.slice(0, Math.ceil(orderedCanopies.length / 2))
    const upperCanopies = orderedCanopies.slice(Math.floor(orderedCanopies.length / 2))
    const radialDistance = (sample) => {
      const dx = sample.center.x - trunk.center.x
      const dz = sample.center.z - trunk.center.z
      return Math.sqrt(dx * dx + dz * dz)
    }
    // Spread must include each pad's own extent: conifers often taper via pad
    // SIZE (broad lower boughs, small upper pads) while pad centers stay near the axis.
    const radialExtent = (sample) => radialDistance(sample) + sample.footprint / 2
    const averageExtent = (items) => items.reduce((sum, sample) => sum + radialExtent(sample), 0) / Math.max(items.length, 1)
    const lowerSpread = averageExtent(lowerCanopies)
    const maxLowerSpread = Math.max(...lowerCanopies.map(radialExtent))
    const maxUpperSpread = Math.max(...upperCanopies.map(radialExtent))

    if (centeredTiers.length >= 3 && branchSupports.length < 2) {
      reasons.push(`Tree reads as stacked uniform conifer tiers with little visible branch support (${centeredTiers.length} center-stacked tiers, ${branchSupports.length} branch supports).`)
    } else if (uniformSpacing && centeredTiers.length >= 3) {
      reasons.push('Conifer-like tree tiers are too evenly stacked and need more asymmetry.')
    }

    if (centeredTiers.length >= 3 && weakTaper) {
      reasons.push('Conifer silhouette lacks clear crown taper from lower boughs to leader.')
    }

    if (
      orderedCanopies.length >= 8
      && centerClustered.length >= Math.ceil(orderedCanopies.length * 0.75)
      && (maxLowerSpread <= maxUpperSpread * 1.25 || lowerSpread < trunk.footprint * 0.95)
    ) {
      reasons.push(`Conifer crown stays too center-clumped and needs broader lower-bough spread (lower-bough max spread ${fmt(maxLowerSpread)}u vs upper ${fmt(maxUpperSpread)}u).`)
    }
  }

  return reasons
}

export function evaluateCreativeAsset({ asset, code = '', assetFamily = 'general', prompt = '' }) {
  const root = asset?.root
  if (!root || !root.isObject3D) {
    return {
      accepted: false,
      reasons: ['Asset did not produce a valid Object3D root.'],
      metrics: {}
    }
  }

  const bounds = new THREE.Box3().setFromObject(root)
  const size = bounds.getSize(new THREE.Vector3())
  const metrics = {
    ...summarizeMeshes(root),
    triangleCount: asset?.triangleCount ?? 0,
    usedAddons: asset?.usedAddons?.length ?? 0,
    minY: Number.isFinite(bounds.min.y) ? bounds.min.y : 0,
    size: [size.x, size.y, size.z]
  }

  const bucket = getAssetFamilyBucket(assetFamily)
  const reasons = []

  if (!Number.isFinite(size.x + size.y + size.z) || size.length() < 0.25) {
    reasons.push('Asset bounds are too small or invalid to read clearly.')
  }

  if (bucket !== 'general' && metrics.minY > 0.35) {
    reasons.push('Grounded asset appears to float above y=0.')
  }

  if (assetFamily === 'treePlant') {
    reasons.push(...evaluateTreeStructure(root, size, prompt))
  }

  if (bucket === 'environment') {
    if (assetFamily !== 'treePlant' && metrics.materialCount > 5) {
      reasons.push('Environment asset uses too many materials for a reusable prop.')
    }
    if (assetFamily !== 'treePlant' && metrics.regularMeshCount > 18 && metrics.instancedMeshCount === 0) {
      reasons.push('Environment asset is too fragmented and should reuse clumps or instances.')
    }
  }

  if (bucket === 'architecture') {
    if (metrics.materialCount > 6) {
      reasons.push('Architecture asset uses too many materials for a coherent style kit.')
    }
    if (metrics.regularMeshCount >= 8 && metrics.instancedMeshCount === 0) {
      reasons.push('Architecture asset looks fragmented instead of reading as a few strong masses.')
    }
    if (size.y < 1) {
      reasons.push('Architecture asset is too flat to read as a structure.')
    }
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    metrics
  }
}

export function formatCreativeCriticFeedback(evaluation) {
  if (!evaluation || evaluation.accepted) {
    return 'Creative critic accepted the asset.'
  }

  return `Creative critic rejected the asset: ${evaluation.reasons.join(' ')}`
}
