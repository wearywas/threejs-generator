import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportAsGLB, exportAsAnimatedGLB } from './exporter'

let downloaded
beforeEach(() => {
  vi.stubGlobal('FileReader', class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.() })
    }
  })
  vi.stubGlobal('document', { createElement: () => ({ click() {} }) })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { downloaded = blob; return 'blob:test' })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function readDownload() {
  return (await new GLTFLoader().parseAsync(await downloaded.arrayBuffer(), '')).scene
}

// Compare exported normals against the actual triangle plane, not a helper's output.
function normalErrors(geometry) {
  const { position, normal } = geometry.attributes
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const face = new THREE.Vector3(), n = new THREE.Vector3()
  let errors = 0
  for (let i = 0; i < (geometry.index?.count ?? position.count); i += 3) {
    const ids = [0, 1, 2].map(offset => geometry.index ? geometry.index.getX(i + offset) : i + offset)
    a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2])
    face.subVectors(c, b).cross(a.sub(b))
    if (face.lengthSq() < 1e-12) continue
    face.normalize()
    if (ids.some(id => n.fromBufferAttribute(normal, id).dot(face) < 0.99999)) errors++
  }
  return errors
}

describe('GLB shading fidelity', () => {
  it.each([exportAsGLB, (root) => exportAsAnimatedGLB(root, [])])('bakes flat normals without changing the live mesh', async exportAsset => {
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    const material = new THREE.MeshStandardMaterial({ flatShading: true })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'Faceted'
    const originalNormal = geometry.attributes.normal
    const normals = Array.from(originalNormal.array)
    const originalIndex = geometry.index
    await exportAsset(mesh)
    const exported = (await readDownload()).getObjectByName('Faceted')
    expect(normalErrors(exported.geometry)).toBe(0)
    expect(mesh.geometry).toBe(geometry)
    expect(geometry.index).toBe(originalIndex)
    expect(geometry.attributes.normal).toBe(originalNormal)
    expect(Array.from(originalNormal.array)).toEqual(normals)
    expect(material.flatShading).toBe(true)
    geometry.dispose(); material.dispose()
  })

  it('keeps a smooth user of shared geometry smooth while preserving instanced flat meshes', async () => {
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    const flat = new THREE.MeshStandardMaterial({ flatShading: true })
    const smooth = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const instances = new THREE.InstancedMesh(geometry, flat, 2)
    instances.name = 'FlatInstances'
    instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 0, 0))
    const soft = new THREE.Mesh(geometry, smooth)
    soft.name = 'Smooth'
    soft.position.y = 4
    root.add(instances, soft)
    await exportAsGLB(root)
    const exported = await readDownload()
    const hard = exported.getObjectByName('FlatInstances')
    expect(normalErrors(hard.geometry)).toBe(0)
    expect(hard.isInstancedMesh).toBe(true)
    expect(hard.count).toBe(2)
    const matrix = new THREE.Matrix4()
    hard.getMatrixAt(1, matrix)
    expect(matrix.elements[12]).toBe(4)
    expect(normalErrors(exported.getObjectByName('Smooth').geometry)).toBeGreaterThan(0)
    expect(instances.geometry).toBe(soft.geometry)
    geometry.dispose(); flat.dispose(); smooth.dispose()
  })

  it('only changes normals belonging to flat material groups', async () => {
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    const half = geometry.index.count / 2
    geometry.clearGroups()
    geometry.addGroup(0, half, 0)
    geometry.addGroup(half, half, 1)
    const flat = new THREE.MeshStandardMaterial({ flatShading: true }); flat.name = 'Flat'
    const smooth = new THREE.MeshStandardMaterial(); smooth.name = 'Smooth'
    const mesh = new THREE.Mesh(geometry, [flat, smooth])
    await exportAsGLB(mesh)
    const exported = await readDownload()
    const meshes = []
    exported.traverse(object => { if (object.isMesh) meshes.push(object) })
    expect(normalErrors(meshes.find(object => object.material.name === 'Flat').geometry)).toBe(0)
    expect(normalErrors(meshes.find(object => object.material.name === 'Smooth').geometry)).toBeGreaterThan(0)
    expect(geometry.index.count).toBe(half * 2)
    geometry.dispose(); flat.dispose(); smooth.dispose()
  })

  it('retains UVs and vertex colors when splitting vertices', async () => {
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    const colors = new Float32Array(geometry.attributes.position.count * 3)
    for (let i = 0; i < colors.length; i++) colors[i] = (i % 11) / 10
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const material = new THREE.MeshStandardMaterial({ flatShading: true, vertexColors: true })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'Attributes'
    await exportAsGLB(mesh)
    const result = (await readDownload()).getObjectByName('Attributes').geometry
    expect(result.index?.count ?? result.attributes.position.count).toBe(geometry.index.count)
    for (let i = 0; i < geometry.index.count; i++) {
      const source = geometry.index.getX(i)
      const target = result.index ? result.index.getX(i) : i
      for (const key of ['uv', 'color']) {
        const expected = geometry.attributes[key], actual = result.attributes[key]
        expect(actual.getX(target)).toBeCloseTo(expected.getX(source), 6)
        expect(actual.getY(target)).toBeCloseTo(expected.getY(source), 6)
      }
    }
    geometry.dispose(); material.dispose()
  })

  it('keeps UUID-bound animation tracks pointing at their cloned target', async () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ flatShading: true }))
    mesh.name = 'Moving'
    root.add(mesh)
    const clip = new THREE.AnimationClip('Move', 1, [new THREE.VectorKeyframeTrack(`${mesh.uuid}.position`, [0, 1], [0, 0, 0, 2, 0, 0])])
    await exportAsAnimatedGLB(root, [clip])
    const result = await new GLTFLoader().parseAsync(await downloaded.arrayBuffer(), '')
    expect(result.animations).toHaveLength(1)
    const mixer = new THREE.AnimationMixer(result.scene)
    mixer.clipAction(result.animations[0]).play()
    mixer.setTime(0.5)
    expect(result.scene.getObjectByName('Moving').position.x).toBeCloseTo(1)
    expect(normalErrors(result.scene.getObjectByName('Moving').geometry)).toBe(0)
    expect(mesh.position.x).toBe(0)
    mesh.geometry.dispose(); mesh.material.dispose()
  })

  it.each([false, true])('releases only temporary geometry, including on export failure (%s)', async fail => {
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    if (fail) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float64Array(geometry.attributes.uv.array), 2))
    const material = new THREE.MeshStandardMaterial({ flatShading: true })
    const mesh = new THREE.Mesh(geometry, material)
    const released = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const materials = vi.spyOn(material, 'dispose')
    if (fail) await expect(exportAsGLB(mesh)).rejects.toThrow('Unsupported bufferAttribute component type')
    else await exportAsGLB(mesh)
    expect(released).toHaveBeenCalledTimes(1)
    expect(released.mock.instances[0]).not.toBe(geometry)
    expect(materials).not.toHaveBeenCalled()
    expect(mesh.geometry).toBe(geometry)
    geometry.dispose(); material.dispose()
  })

  it.each([[false, true], [true, true], [false, false], [true, false]])('bakes flat morph normals with relative targets %s and supplied normals %s', async (relative, suppliedNormals) => {
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    geometry.morphTargetsRelative = relative
    const targetPosition = geometry.attributes.position.clone()
    const targetNormal = geometry.attributes.normal.clone()
    for (let i = 0; i < targetPosition.count; i++) {
      // A visibly different target, including the relative-delta representation.
      targetPosition.setXYZ(i, targetPosition.getX(i) * (relative ? 0.7 : 1.7), relative ? 0 : targetPosition.getY(i), relative ? 0 : targetPosition.getZ(i))
      if (relative) targetNormal.setXYZ(i, 0, 0, 0)
    }
    geometry.morphAttributes.position = [targetPosition]
    if (suppliedNormals) geometry.morphAttributes.normal = [targetNormal]
    const material = new THREE.MeshStandardMaterial({ flatShading: true })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'Morph'; mesh.morphTargetInfluences[0] = 1
    const original = Array.from(targetNormal.array)
    await exportAsGLB(mesh)
    const result = (await readDownload()).getObjectByName('Morph')
    const deformed = result.geometry.clone()
    for (const key of ['position', 'normal']) {
      const base = result.geometry.attributes[key], delta = result.geometry.morphAttributes[key][0]
      for (let i = 0; i < base.count; i++) deformed.attributes[key].setXYZ(i, base.getX(i) + delta.getX(i), base.getY(i) + delta.getY(i), base.getZ(i) + delta.getZ(i))
    }
    expect(result.morphTargetInfluences[0]).toBe(1)
    expect(normalErrors(deformed)).toBe(0)
    if (suppliedNormals) expect(geometry.morphAttributes.normal[0]).toBe(targetNormal)
    else expect(geometry.morphAttributes.normal).toBeUndefined()
    expect(Array.from(targetNormal.array)).toEqual(original)
    deformed.dispose(); geometry.dispose(); material.dispose()
  })

  it('exports valid geometry even when optional object metadata is circular', async () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ flatShading: true }))
    mesh.name = 'Circular'; root.add(mesh)
    root.userData.self = root.userData
    mesh.userData.self = mesh.userData
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await exportAsGLB(root)
    expect(normalErrors((await readDownload()).getObjectByName('Circular').geometry)).toBe(0)
    expect(root.userData.self).toBe(root.userData)
    expect(mesh.userData.self).toBe(mesh.userData)
    warning.mockRestore()
    mesh.geometry.dispose(); mesh.material.dispose()
  })

  it('preserves skinned bindings and UUID-bound bone animation', async () => {
    const root = new THREE.Group(), bone = new THREE.Bone()
    bone.name = 'Joint'
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    const count = geometry.attributes.position.count
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4))
    const weights = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) weights[i * 4] = 1
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ flatShading: true }))
    mesh.name = 'Skinned'
    root.add(bone, mesh)
    mesh.bind(new THREE.Skeleton([bone]))
    const clip = new THREE.AnimationClip('Bend', 1, [new THREE.VectorKeyframeTrack(`${bone.uuid}.position`, [0, 1], [0, 0, 0, 0, 2, 0])])
    await exportAsAnimatedGLB(root, [clip])
    const result = await new GLTFLoader().parseAsync(await downloaded.arrayBuffer(), '')
    const exported = result.scene.getObjectByName('Skinned'), joint = result.scene.getObjectByName('Joint')
    expect(exported.isSkinnedMesh).toBe(true)
    expect(exported.skeleton.bones).toEqual([joint])
    expect(normalErrors(exported.geometry)).toBe(0)
    expect(result.animations).toHaveLength(1)
    const mixer = new THREE.AnimationMixer(result.scene)
    mixer.clipAction(result.animations[0]).play()
    mixer.setTime(0.5)
    expect(joint.position.y).toBeCloseTo(1)
    expect(mesh.skeleton.bones).toEqual([bone])
    expect(bone.position.y).toBe(0)
    geometry.dispose(); mesh.material.dispose()
  })

  it('does not re-run custom mesh constructors while taking an export snapshot', async () => {
    class CustomMesh extends THREE.Mesh {
      constructor(required) {
        if (!required) throw new Error('Custom constructor requires arguments')
        super(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ flatShading: true }))
      }
    }
    const mesh = new CustomMesh(true)
    mesh.name = 'Custom'
    await exportAsGLB(mesh)
    expect(normalErrors((await readDownload()).getObjectByName('Custom').geometry)).toBe(0)
    mesh.geometry.dispose(); mesh.material.dispose()
  })

  it.each(['DirectionalLight', 'SpotLight'])('clones %s children once and safely remaps its target', async type => {
    class LampBody extends THREE.Mesh {
      constructor(required) {
        if (!required) throw new Error('Lamp body requires arguments')
        super(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ flatShading: true }))
      }
    }
    const root = new THREE.Group(), light = new THREE[type](0xffcc88, 3), body = new LampBody(true)
    body.name = 'LampBody'; light.name = 'Light'
    light.target.position.set(0, 0, -1)
    light.target.userData.self = light.target.userData
    light.add(body, light.target); root.add(light)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await exportAsGLB(root)
    const scene = await readDownload(), bodies = [], lights = []
    scene.traverse(object => { if (object.isMesh) bodies.push(object); if (object.isLight) lights.push(object) })
    expect(bodies).toHaveLength(1)
    expect(lights).toHaveLength(1)
    expect(lights[0].intensity).toBe(3)
    expect(warning.mock.calls.flat().join('\n')).not.toContain('Light direction may be lost')
    expect(light.children).toEqual([body, light.target])
    expect(light.target.userData.self).toBe(light.target.userData)
    body.geometry.dispose(); body.material.dispose(); warning.mockRestore()
  })
})
