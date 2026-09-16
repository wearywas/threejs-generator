import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

// Capture before any generated factory runs in the isolated worker.
const parseGLB = GLTFExporter.prototype.parseAsync

function flatRanges(mesh) {
  const flat = material => material?.flatShading === true && !material.wireframe
  if (!mesh.isMesh) return []
  if (Array.isArray(mesh.material)) return mesh.geometry.groups.filter(group => flat(mesh.material[group.materialIndex]))
  return flat(mesh.material) ? [{ start: 0, count: Infinity }] : []
}

function copyNormals(source, count) {
  const normal = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3)
  if (source) for (let i = 0; i < count; i++) normal.setXYZ(i, source.getX(i), source.getY(i), source.getZ(i))
  return normal
}

function writeFaceNormals(position, normal, ranges, basePosition = null, baseNormal = null) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), base = new THREE.Vector3()
  for (const range of ranges) {
    const end = Math.min(position.count, range.start + range.count)
    for (let i = range.start; i + 2 < end; i += 3) {
      a.fromBufferAttribute(position, i)
      b.fromBufferAttribute(position, i + 1)
      c.fromBufferAttribute(position, i + 2)
      if (basePosition) {
        a.add(base.fromBufferAttribute(basePosition, i))
        b.add(base.fromBufferAttribute(basePosition, i + 1))
        c.add(base.fromBufferAttribute(basePosition, i + 2))
      }
      face.subVectors(c, b).cross(a.sub(b)).normalize()
      for (let offset = 0; offset < 3; offset++) {
        if (baseNormal) base.fromBufferAttribute(baseNormal, i + offset)
        else base.set(0, 0, 0)
        normal.setXYZ(i + offset, face.x - base.x, face.y - base.y, face.z - base.z)
      }
    }
  }
}

function bakeFaceNormals(geometry, ranges) {
  const position = geometry.attributes.position
  const previous = geometry.attributes.normal
  const normal = copyNormals(previous, position.count)
  geometry.setAttribute('normal', normal)
  if (!previous) geometry.computeVertexNormals()
  writeFaceNormals(position, normal, ranges)

  const positions = geometry.morphAttributes.position || []
  const normals = geometry.morphAttributes.normal || []
  const count = Math.max(positions.length, normals.length)
  if (!count) return
  geometry.morphAttributes.normal = Array.from({ length: count }, (_, i) => {
    const relative = geometry.morphTargetsRelative
    const target = copyNormals(normals[i] || (relative ? null : normal), position.count)
    writeFaceNormals(positions[i] || position, target, ranges, relative && positions[i] ? position : null, relative ? normal : null)
    return target
  })
}

function cloneForExport(root) {
  const copies = new Map()
  const copy = source => {
    if (copies.has(source)) return copies.get(source)
    // Export needs standard scene data, not addon constructors (e.g. Water).
    const type = ['SkinnedMesh', 'InstancedMesh', 'Mesh', 'LineSegments', 'LineLoop', 'Line', 'Points',
      'DirectionalLight', 'PointLight', 'SpotLight', 'PerspectiveCamera', 'OrthographicCamera', 'Bone', 'Group', 'Scene']
      .find(name => source[`is${name}`]) || 'Object3D'
    const target = type === 'InstancedMesh'
      ? new THREE.InstancedMesh(source.geometry, source.material, source.count)
      : new THREE[type]()
    // Object3D.copy JSON-clones metadata. Let the exporter handle invalid extras
    // instead; borrowing userData here never changes the live object's metadata.
    const sourceView = Object.assign(Object.create(source), { userData: {}, children: [] })
    if (target.isLight) {
      // Light subclasses can recursively clone children, targets and shadows.
      // glTF only needs these light properties; targets are remapped below.
      THREE.Light.prototype.copy.call(target, sourceView, false)
      for (const key of ['distance', 'decay', 'angle', 'penumbra']) {
        if (key in source) target[key] = source[key]
      }
    } else target.copy(sourceView, false)
    target.userData = source.userData
    target.uuid = source.uuid
    copies.set(source, target)
    for (const child of source.children) target.add(copy(child))
    return target
  }
  const snapshot = copy(root)
  for (const [source, target] of copies) {
    if (target.isLight && source.target) target.target = copy(source.target)
    if (!source.isSkinnedMesh) continue
    target.skeleton = source.skeleton.clone()
    target.skeleton.bones = source.skeleton.bones.map(bone => copies.get(bone))
    target.bind(target.skeleton, source.bindMatrix)
  }
  return snapshot
}

/** Export a detached snapshot: glTF has vertex normals but no flatShading flag.
 * Split vertices only for flat surfaces; never rewrite the visible asset's buffers. */
export async function createGLB(root, options = {}) {
  const snapshot = cloneForExport(root)
  const geometries = new Map()
  const owned = new Set()
  try {
    const copyGeometry = object => {
      if (!object.geometry?.isBufferGeometry) return
      const original = object.geometry
      const ranges = flatRanges(object)
      const key = ranges.map(range => `${range.start}:${range.count}`).join(',')
      if (!geometries.has(original)) geometries.set(original, new Map())
      const variants = geometries.get(original)
      if (!variants.has(key)) {
        const geometry = ranges.length && original.index ? original.toNonIndexed() : original.clone()
        owned.add(geometry)
        // toNonIndexed preserves attributes/groups, but not these export settings.
        geometry.name = original.name
        geometry.userData = { ...original.userData }
        geometry.setDrawRange(original.drawRange.start, original.drawRange.count)
        if (ranges.length && geometry.attributes.position) bakeFaceNormals(geometry, ranges)
        variants.set(key, geometry)
      }
      object.geometry = variants.get(key)
    }
    snapshot.traverse(copyGeometry)
    return await parseGLB.call(new GLTFExporter(), snapshot, { ...options, binary: true, includeCustomExtensions: false })
  } finally {
    // Materials and textures are borrowed; only snapshot geometry is ours.
    for (const geometry of owned) geometry.dispose()
  }
}
