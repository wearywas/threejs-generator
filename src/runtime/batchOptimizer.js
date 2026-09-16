import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'

// Capture trusted defaults at module load, before generated assets can replace
// prototype hooks. Comparing against a freshly constructed mesh is not enough.
const objectHooks = Object.fromEntries(['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow']
  .map(key => [key, THREE.Object3D.prototype[key]]))
const materialHooks = Object.fromEntries(['onBeforeRender', 'onBeforeCompile', 'customProgramCacheKey']
  .map(key => [key, THREE.Material.prototype[key]]))
const objectTypes = new Map([THREE.Object3D, THREE.Group, THREE.Scene, THREE.Mesh, THREE.InstancedMesh,
  THREE.Line, THREE.LineLoop, THREE.LineSegments, THREE.Points].map(Type => [Type.prototype, Type]))
const geometryTypes = new Set(Object.entries(THREE)
  .filter(([name, Type]) => name.endsWith('Geometry') && Type.prototype)
  .map(([, Type]) => Type.prototype))
// This registered official addon only constructs static BufferGeometry data.
// Accept its exact prototype, not arbitrary subclasses or overridden methods.
geometryTypes.add(ConvexGeometry.prototype)
const materialTypes = new Set(Object.entries(THREE)
  .filter(([name, Type]) => name.endsWith('Material') && !name.includes('Shader') && Type.prototype)
  .map(([, Type]) => Type.prototype))
const objectCopy = THREE.Object3D.prototype.copy
const instanceDispose = THREE.InstancedMesh.prototype.dispose
const uploadCallback = THREE.BufferAttribute.prototype.onUploadCallback
const interleavedUploadCallback = THREE.InterleavedBuffer.prototype.onUploadCallback
const renderFlags = ['castShadow', 'receiveShadow', 'renderOrder', 'frustumCulled']
const identityKeys = new Set(['id', 'uuid', 'name'])
const MAX_EXACT_COMPARISONS = 20_000
const operationNames = ['updateMatrix', 'updateMatrixWorld', 'updateWorldMatrix', 'clone', 'copy',
  'getVertexPosition', 'getMatrixAt', 'getColorAt', 'computeBoundingSphere', 'computeBoundingBox', 'updateMorphTargets']
const operationDefaults = new Map([...objectTypes.keys(), ...geometryTypes].map(prototype =>
  [prototype, operationNames.map(key => [key, prototype[key]])]))

function customOperations(object) {
  return operationDefaults.get(Object.getPrototypeOf(object))?.some(([key, original]) => object[key] !== original)
}

function walk(node, visit) {
  visit(node)
  for (const child of node.children) walk(child, visit)
}

function localMatrix(node) {
  return node.matrixAutoUpdate
    ? new THREE.Matrix4().compose(node.position, node.quaternion, node.scale)
    : node.matrix.clone()
}

function worldMatrix(node) {
  if (!node) return new THREE.Matrix4()
  if (!node.matrixWorldAutoUpdate) return node.matrixWorld.clone()
  return worldMatrix(node.parent).multiply(localMatrix(node))
}

// An instanced normal transform assumes perpendicular basis vectors. Do not
// decompose/recompose shears (or accept reflections), silently changing shading.
function safeTransform(matrix) {
  const e = matrix.elements
  if (!e.every(Number.isFinite) || e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1) return false
  const axes = [0, 4, 8].map(i => new THREE.Vector3(e[i], e[i + 1], e[i + 2]))
  const lengths = axes.map(axis => axis.length())
  if (lengths.some(length => length <= 1e-12) || matrix.determinant() <= 0) return false
  return [[0, 1], [0, 2], [1, 2]].every(([a, b]) => Math.abs(axes[a].dot(axes[b])) <= 1e-6 * lengths[a] * lengths[b])
}

function sameData(a, b, pairs = new WeakMap()) {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
  if (pairs.get(a) === b) return true
  pairs.set(a, b)
  if (ArrayBuffer.isView(a)) {
    if (a.byteLength !== b.byteLength) return false
    const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
    const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
    return left.every((value, index) => value === right[index])
  }
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameData(a[key], b[key], pairs))
}

function sameMaterial(a, b) {
  if (a === b) return true
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
  const keys = Object.keys(a).filter(key => !identityKeys.has(key))
  const otherKeys = Object.keys(b).filter(key => !identityKeys.has(key))
  return keys.length === otherKeys.length && keys.every(key => Object.hasOwn(b, key) && sameData(a[key], b[key]))
}

function sameAttribute(a, b) {
  if (a === b) return true
  return !!a && !!b && a.constructor === b.constructor && a.itemSize === b.itemSize &&
    a.normalized === b.normalized && a.gpuType === b.gpuType && a.count === b.count && sameData(a.array, b.array)
}

function sameGeometry(a, b) {
  if (a === b) return true
  const keys = Object.keys(a.attributes)
  return keys.length === Object.keys(b.attributes).length && keys.every(key => sameAttribute(a.attributes[key], b.attributes[key])) &&
    sameAttribute(a.index, b.index) && sameData(a.groups, b.groups) && sameData(a.drawRange, b.drawRange)
}

function groupLayerReason(node) {
  return node.isGroup && node.layers.mask !== 1
    ? 'Non-default Group layers make render ordering camera-dependent.' : null
}

function materialOrderReason(material) {
  if (material.stencilWrite) return 'Stencil interactions require the original whole-layout render ordering.'
  // Transparent/transmissive draws stay in their own later render lists and
  // are never consolidated. Their usual depthWrite=false is safe passthrough.
  const opaque = !material.transparent && !(material.transmission > 0)
  if (opaque && (!material.depthTest || !material.depthWrite || !material.colorWrite ||
    material.depthFunc !== THREE.LessEqualDepth ||
    (material.blending !== THREE.NormalBlending && material.blending !== THREE.NoBlending))) {
    return 'Order-dependent opaque material state requires the original whole-layout render ordering.'
  }
  return null
}

function unsafeReason(node) {
  if (Object.entries(objectHooks).some(([key, original]) => node[key] !== original)) return 'Custom object render/shadow hook or callback.'
  if (!objectTypes.has(Object.getPrototypeOf(node))) return 'Unsupported object subclass, skinning or custom behavior.'
  if (customOperations(node)) return 'Custom object transform or copy behavior is unsupported.'
  if (node.animations.length) return 'Animation cannot be optimized as a static snapshot.'
  if (!node.matrixWorldAutoUpdate) return 'Manually managed world matrices cannot be safely batched.'
  if (groupLayerReason(node)) return groupLayerReason(node)
  // Even excluded instance meshes get cloned buffers, unlike borrowed geometry.
  if (node.isInstancedMesh && [node.instanceMatrix, node.instanceColor].filter(Boolean)
    .some(attribute => attribute.usage !== THREE.StaticDrawUsage)) return 'Non-static instance buffers require the live original layout.'
  for (const material of [node.material, node.customDepthMaterial, node.customDistanceMaterial].flat().filter(Boolean)) {
    if (Object.entries(materialHooks).some(([key, original]) => material[key] !== original)) return 'Custom material program/render hook or callback.'
    if (!materialTypes.has(Object.getPrototypeOf(material))) return 'Custom shaders or material subclasses are unsupported.'
    const orderReason = materialOrderReason(material)
    if (orderReason) return orderReason
  }
  const geometry = node.geometry
  if (geometry) {
    if (!geometryTypes.has(Object.getPrototypeOf(geometry))) return 'Custom geometry behavior is unsupported.'
    if (customOperations(geometry)) return 'Custom geometry bounds or copy callback is unsupported.'
    if (Object.keys(geometry.morphAttributes).length || node.morphTexture || node.morphTargetInfluences?.length) return 'Morph animation is unsupported.'
    for (const attribute of [geometry.index, ...Object.values(geometry.attributes), node.instanceMatrix, node.instanceColor].filter(Boolean)) {
      if (attribute.onUploadCallback && attribute.onUploadCallback !== uploadCallback) return 'Custom geometry upload callback is unsupported.'
      if (attribute.isInterleavedBufferAttribute && attribute.data.onUploadCallback !== interleavedUploadCallback) return 'Custom interleaved geometry upload callback is unsupported.'
    }
  }
  return null
}

function eligible(node, visible) {
  if (!node.isMesh || !visible || !node.geometry.attributes.position || node.geometry.isInstancedBufferGeometry) return false
  if (Array.isArray(node.material) || !node.material?.visible || node.customDepthMaterial || node.customDistanceMaterial) return false
  const material = node.material
  if (material.transparent || material.opacity !== 1 || material.transmission > 0 || material.wireframe ||
    Object.values(material).some(value => value?.isTexture)) return false
  if ([node.geometry.index, ...Object.values(node.geometry.attributes)].filter(Boolean)
    .some(attribute => !attribute.isBufferAttribute || attribute.isInstancedBufferAttribute || attribute.usage !== THREE.StaticDrawUsage)) return false
  if (node.isInstancedMesh && (!Number.isSafeInteger(node.count) || node.count < 1 || node.count > node.instanceMatrix.count ||
    (node.instanceColor && node.count > node.instanceColor.count))) return false
  if (node.isInstancedMesh && !standardInstanceAttribute(node.instanceMatrix, 16)) return false
  if (node.instanceColor && !standardInstanceAttribute(node.instanceColor, 3)) return false
  return true
}

function standardInstanceAttribute(attribute, itemSize) {
  return attribute?.isInstancedBufferAttribute && attribute.array instanceof Float32Array &&
    attribute.itemSize === itemSize && !attribute.normalized && attribute.meshPerAttribute === 1 && attribute.usage === THREE.StaticDrawUsage
}

function attributeSignature(attribute) {
  if (!attribute) return null
  const array = attribute.array
  return [array.constructor.name, attribute.itemSize, attribute.normalized, attribute.gpuType, array.length,
    array[0], array[Math.floor(array.length / 2)], array[array.length - 1]]
}

// Cheap buckets are only an accelerator, never proof of compatibility. Exact
// comparison below catches unsampled differences and all signature collisions.
function candidateKey(entry, geometryKeys, materialKeys) {
  const { node, groupOrder } = entry
  const { geometry, material } = node
  if (!geometryKeys.has(geometry)) {
    geometryKeys.set(geometry, JSON.stringify([attributeSignature(geometry.index),
      Object.keys(geometry.attributes).sort().map(key => [key, attributeSignature(geometry.attributes[key])]), geometry.groups, geometry.drawRange]))
  }
  if (!materialKeys.has(material)) {
    materialKeys.set(material, JSON.stringify([material.type, material.color?.toArray(), material.emissive?.toArray(),
      material.roughness, material.metalness, material.side, material.depthTest, material.depthWrite]))
  }
  return JSON.stringify([geometryKeys.get(geometry), materialKeys.get(material), groupOrder, node.layers.mask,
    ...renderFlags.map(key => node[key])])
}

function candidate(node, relative, world, groupOrder, visible) {
  if (!eligible(node, visible) || !safeTransform(relative) || !safeTransform(world)) return null
  const matrices = []
  const colors = []
  for (let i = 0; i < (node.isInstancedMesh ? node.count : 1); i++) {
    const instance = node.isInstancedMesh ? new THREE.Matrix4().fromArray(node.instanceMatrix.array, i * 16) : new THREE.Matrix4()
    const matrix = relative.clone().multiply(instance)
    if (!safeTransform(instance) || !safeTransform(matrix) || !safeTransform(world.clone().multiply(instance))) return null
    matrices.push(matrix)
    colors.push(node.instanceColor ? new THREE.Color().fromArray(node.instanceColor.array, i * 3) : new THREE.Color(1, 1, 1))
  }
  return { node, matrices, colors, groupOrder }
}

function compatible(a, b) {
  return a.groupOrder === b.groupOrder && a.node.layers.mask === b.node.layers.mask &&
    renderFlags.every(key => a.node[key] === b.node[key]) &&
    sameMaterial(a.node.material, b.node.material) && sameGeometry(a.node.geometry, b.node.geometry)
}

function cloneTree(node, consumed, owned) {
  let clone
  // Consumed draw objects become transform-only shells; their children retain
  // their original hierarchy. No throwaway InstancedMesh clone is allocated.
  if (consumed.has(node)) {
    clone = objectCopy.call(new THREE.Object3D(), node, false)
  } else {
    const Type = objectTypes.get(Object.getPrototypeOf(node))
    clone = node.isInstancedMesh ? new Type(node.geometry, node.material, 0)
      : node.geometry ? new Type(node.geometry, node.material) : new Type()
    if (clone.isInstancedMesh) owned.add(clone)
    clone.copy(node, false)
    if (node.customDepthMaterial) clone.customDepthMaterial = node.customDepthMaterial
    if (node.customDistanceMaterial) clone.customDistanceMaterial = node.customDistanceMaterial
  }
  for (const child of node.children) clone.add(cloneTree(child, consumed, owned))
  return clone
}

/**
 * Build a static, appearance-preserving batching snapshot in root's local frame.
 * Geometry/materials/textures are borrowed: keep the source alive until dispose().
 * Report counts describe draw objects, not camera-dependent renderer statistics.
 */
export function optimizeBatchSnapshot(root, { hasAnimation = false } = {}) {
  const report = { sourceMeshes: 0, resultMeshes: 0, groups: 0, instances: 0, skippedMeshes: 0, reason: null }
  const owned = new Set()
  const dispose = () => {
    for (const instance of owned) {
      owned.delete(instance)
      instanceDispose.call(instance)
    }
  }
  const unchanged = reason => {
    dispose()
    report.resultMeshes = report.skippedMeshes = report.sourceMeshes
    report.groups = report.instances = 0
    report.reason = reason
    return { root: null, report, dispose }
  }
  if (!root?.isObject3D) return unchanged('A Three.js layout root is required.')
  walk(root, node => { if (node.isMesh) report.sourceMeshes++ })
  if (hasAnimation) return unchanged('Animation cannot be optimized as a static snapshot.')
  let reason = null
  for (let ancestor = root.parent; ancestor && !reason; ancestor = ancestor.parent) reason = groupLayerReason(ancestor)
  walk(root, node => { reason ||= unsafeReason(node) })
  if (reason) return unchanged(reason)

  try {
    const rootWorld = worldMatrix(root)
    const groups = []
    const buckets = new Map()
    const geometryKeys = new WeakMap()
    const materialKeys = new WeakMap()
    let comparisons = 0
    let overBudget = false
    const visit = (node, relative, visible, groupOrder) => {
      if (overBudget) return
      visible &&= node.visible
      if (node.isGroup) groupOrder = node.renderOrder
      const entry = candidate(node, relative, rootWorld.clone().multiply(relative), groupOrder, visible)
      if (entry) {
        const key = candidateKey(entry, geometryKeys, materialKeys)
        const bucket = buckets.get(key) ?? []
        let group
        for (const items of bucket) {
          if (++comparisons > MAX_EXACT_COMPARISONS) { overBudget = true; return }
          if (compatible(items[0], entry)) { group = items; break }
        }
        if (group) group.push(entry)
        else {
          group = [entry]
          groups.push(group)
          bucket.push(group)
          buckets.set(key, bucket)
        }
      }
      for (const child of node.children) visit(child, relative.clone().multiply(localMatrix(child)), visible, groupOrder)
    }
    visit(root, new THREE.Matrix4(), true, root.renderOrder)
    if (overBudget) return unchanged('Exact compatibility comparison budget exceeded; the original layout is unchanged.')
    const consolidated = groups.filter(group => group.length >= 2)
    if (!consolidated.length) return unchanged('No compatible static draw objects can be consolidated.')
    const consumed = new Set(consolidated.flatMap(group => group.map(entry => entry.node)))
    const snapshot = cloneTree(root, consumed, owned)
    for (const group of consolidated) {
      const first = group[0]
      const count = group.reduce((n, entry) => n + entry.matrices.length, 0)
      const batch = new THREE.InstancedMesh(first.node.geometry, first.node.material, count)
      owned.add(batch)
      batch.name = 'Optimized batch'
      batch.layers.mask = first.node.layers.mask
      for (const key of renderFlags) batch[key] = first.node[key]
      const hasColors = group.some(entry => entry.node.instanceColor)
      let index = 0
      for (const entry of group) {
        entry.matrices.forEach((matrix, i) => {
          batch.setMatrixAt(index, matrix)
          if (hasColors) batch.setColorAt(index, entry.colors[i])
          index++
        })
      }
      batch.instanceMatrix.needsUpdate = true
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true
      // Preserve the nearest Group's sort order after lifting draw objects out
      // of independent generated variants.
      const container = new THREE.Group()
      container.renderOrder = first.groupOrder
      container.add(batch)
      snapshot.add(container)
      report.instances += count
    }
    report.groups = consolidated.length
    report.skippedMeshes = report.sourceMeshes - consumed.size
    report.resultMeshes = report.skippedMeshes + report.groups
    return { root: snapshot, report, dispose }
  } catch {
    return unchanged('The layout contains data that cannot be safely copied or batched.')
  }
}
