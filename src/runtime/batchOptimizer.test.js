import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { WebGLRenderList } from 'three/src/renderers/webgl/WebGLRenderLists.js'
import { optimizeBatchSnapshot } from './batchOptimizer.js'

function pair() {
  const root = new THREE.Group()
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    mesh.position.x = i * 4
    mesh.name = `box-${i}`
    root.add(mesh)
  }
  return root
}

function meshes(root) {
  const result = []
  root?.traverse(node => { if (node.isMesh) result.push(node) })
  return result
}

// Independent render-input oracle: expand source and result into world vertices,
// full world matrices and effective colors, without optimizer grouping helpers.
function renderInputs(root) {
  root.updateWorldMatrix(true, true)
  const result = []
  root.traverseVisible(mesh => {
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.material.visible) return
    const geometry = mesh.geometry
    const position = geometry.attributes.position
    const available = geometry.index?.count ?? position.count
    const start = Math.max(0, geometry.drawRange.start)
    const end = Math.min(available, start + geometry.drawRange.count)
    for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
      const matrix = mesh.matrixWorld.clone()
      const color = mesh.material.color?.clone() ?? new THREE.Color(1, 1, 1)
      if (mesh.isInstancedMesh) {
        const local = new THREE.Matrix4()
        mesh.getMatrixAt(instance, local)
        matrix.multiply(local)
        if (mesh.instanceColor) {
          const tint = new THREE.Color()
          mesh.getColorAt(instance, tint)
          color.multiply(tint)
        }
      }
      const vertices = []
      for (let i = start; i < end; i++) {
        const index = geometry.index ? geometry.index.getX(i) : i
        vertices.push(...new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix).toArray())
      }
      result.push({ matrix: matrix.toArray(), vertices, color: color.toArray(), triangles: (end - start) / 3 })
    }
  })
  return result.sort((a, b) => a.matrix[12] - b.matrix[12] || a.matrix[13] - b.matrix[13] || a.matrix[14] - b.matrix[14])
}

function expectSameRendering(expected, actual) {
  expect(actual).toHaveLength(expected.length)
  expect(actual.reduce((n, item) => n + item.triangles, 0)).toBe(expected.reduce((n, item) => n + item.triangles, 0))
  expected.forEach((item, index) => {
    for (const key of ['matrix', 'vertices', 'color']) {
      expect(actual[index][key]).toHaveLength(item[key].length)
      item[key].forEach((value, i) => expect(actual[index][key][i]).toBeCloseTo(value, 4))
    }
  })
}

function replaceForComparison(source, snapshot) {
  const parent = source.parent
  parent?.remove(source)
  parent?.add(snapshot)
  return renderInputs(snapshot)
}

function opaqueDrawColors(root, camera = new THREE.PerspectiveCamera()) {
  const list = new WebGLRenderList()
  const project = (node, groupOrder) => {
    if (!node.visible) return
    if (node.layers.test(camera.layers)) {
      if (node.isGroup) groupOrder = node.renderOrder
      if (node.isMesh) list.push(node, node.geometry, node.material, groupOrder, node.position.z, null)
    }
    node.children.forEach(child => project(child, groupOrder))
  }
  project(root, 0)
  list.sort()
  return list.opaque.flatMap(item => Array(item.object.count ?? 1).fill(item.material.color.getHexString()))
}

describe('optimizeBatchSnapshot', () => {
  it('batches the explicitly registered official ConvexGeometry addon without reconstructing its buffers', () => {
    const points = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].map(point => new THREE.Vector3(...point))
    const root = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new ConvexGeometry(points), new THREE.MeshStandardMaterial())
      mesh.position.set(i * 3, 1, 2)
      root.add(mesh)
    }
    const before = renderInputs(root)
    expect(before.reduce((count, item) => count + item.triangles, 0)).toBe(8)
    const result = optimizeBatchSnapshot(root)
    expect(result.root !== null).toBe(true)
    expect(result.report).toMatchObject({ sourceMeshes: 2, resultMeshes: 1, groups: 1, instances: 2, reason: null })
    expect(meshes(result.root)[0].geometry).toBe(root.children[0].geometry)
    expectSameRendering(before, renderInputs(result.root))
    result.dispose()
  })

  it.each(['subclass', 'overridden bounds'])('still rejects ConvexGeometry %s custom behavior', kind => {
    const root = pair()
    const points = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].map(point => new THREE.Vector3(...point))
    class CustomConvexGeometry extends ConvexGeometry {}
    const geometry = kind === 'subclass' ? new CustomConvexGeometry(points) : new ConvexGeometry(points)
    if (kind === 'overridden bounds') geometry.computeBoundingSphere = () => { root.children[0].visible = false }
    root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()))
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    expect(result.report.reason).toMatch(/custom/i)
    expect(root.children[0].visible).toBe(true)
  })

  it('consolidates independent equal geometry/materials without modifying source ownership or stale matrices', () => {
    const root = pair()
    root.position.set(10, 2, -3)
    const parent = new THREE.Group()
    parent.position.set(3, 4, 5)
    parent.add(root)
    const originals = [...root.children]
    const staleMatrices = originals.map(mesh => mesh.matrix.toArray())
    const result = optimizeBatchSnapshot(root)

    expect(result.root).not.toBeNull()
    expect(result.root).not.toBe(root)
    expect(result.root.position.toArray()).toEqual([10, 2, -3])
    expect(root.children).toEqual(originals)
    originals.forEach((mesh, i) => {
      expect(mesh.parent).toBe(root)
      expect(mesh.matrix.toArray()).toEqual(staleMatrices[i])
    })
    const [batch] = meshes(result.root)
    expect(batch.isInstancedMesh).toBe(true)
    expect(batch.count).toBe(2)
    expect(batch.geometry).toBe(originals[0].geometry)
    expect(batch.material).toBe(originals[0].material)
    expect(result.report).toEqual({ sourceMeshes: 2, resultMeshes: 1, groups: 1, instances: 2, skippedMeshes: 0, reason: null })
    expectSameRendering(renderInputs(root), replaceForComparison(root, result.root))
    result.dispose()
  })

  it('folds nested transforms, existing instance matrices and mixed colors into world-equivalent instances', () => {
    const root = new THREE.Group()
    root.position.set(7, -3, 2)
    root.rotation.y = 0.4
    root.scale.setScalar(1.5)
    const parent = new THREE.Group()
    parent.position.set(-2, 5, 1)
    parent.rotation.z = 0.2
    parent.add(root)
    for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
      const group = new THREE.Group()
      group.position.x = groupIndex * 10
      group.rotation.y = groupIndex * 0.3
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xabcdef }), 2)
      mesh.position.set(1, 2, 3)
      for (let index = 0; index < 2; index++) {
        mesh.setMatrixAt(index, new THREE.Matrix4().compose(new THREE.Vector3(index * 2, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 2, 3)))
        if (groupIndex === 0) mesh.setColorAt(index, new THREE.Color(index ? 0x00ff00 : 0xff0000))
      }
      group.add(mesh)
      root.add(group)
    }
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xabcdef }))
    plain.position.x = 30
    root.add(plain)
    const before = renderInputs(root)
    const result = optimizeBatchSnapshot(root)
    expect(result.report).toMatchObject({ sourceMeshes: 3, resultMeshes: 1, groups: 1, instances: 5 })
    expect(meshes(result.root)[0].instanceColor).not.toBeNull()
    expectSameRendering(before, replaceForComparison(root, result.root))
    result.dispose()
  })

  it('retains child meshes when their mesh parent is batched', () => {
    const root = pair()
    const child = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial({ color: 'red' }))
    child.position.set(3, 2, 1)
    root.children[1].add(child)
    const before = renderInputs(root)
    const result = optimizeBatchSnapshot(root)
    expect(result.report.resultMeshes).toBe(2)
    expectSameRendering(before, renderInputs(result.root))
  })

  it('does not claim improvement for one existing instanced draw object', () => {
    const root = new THREE.Group()
    root.add(new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 30))
    const result = optimizeBatchSnapshot(root)
    expect(result.root).toBeNull()
    expect(result.report).toMatchObject({ sourceMeshes: 1, resultMeshes: 1, groups: 0, instances: 0, skippedMeshes: 1 })
    expect(result.report.reason).toEqual(expect.any(String))
    expect(() => { result.dispose(); result.dispose() }).not.toThrow()
  })

  it.each([
    ['position data', mesh => { mesh.geometry.attributes.position.array[0] += 0.25 }],
    ['normal data', mesh => { mesh.geometry.attributes.normal.array[0] += 0.25 }],
    ['UV data', mesh => { mesh.geometry.attributes.uv.array[0] += 0.25 }],
    ['index data', mesh => { mesh.geometry.index.array[0] = 2 }],
    ['index type', mesh => { mesh.geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.geometry.index.array, 1)) }],
    ['attribute normalized', mesh => { mesh.geometry.attributes.normal.normalized = true }],
    ['extra attribute', mesh => { mesh.geometry.setAttribute('custom', new THREE.Float32BufferAttribute(new Float32Array(24), 1)) }],
    ['groups', mesh => { mesh.geometry.groups[0].materialIndex = 7 }],
    ['draw range', mesh => { mesh.geometry.setDrawRange(3, 9) }],
    ['color', mesh => { mesh.material.color.r = 0.5 }],
    ['roughness', mesh => { mesh.material.roughness = 0.4 }],
    ['flat shading', mesh => { mesh.material.flatShading = true }],
    ['side', mesh => { mesh.material.side = THREE.DoubleSide }],
    ['layers', mesh => { mesh.layers.set(2) }],
    ['castShadow', mesh => { mesh.castShadow = true }],
    ['receiveShadow', mesh => { mesh.receiveShadow = true }],
    ['renderOrder', mesh => { mesh.renderOrder = 5 }],
    ['frustum flag', mesh => { mesh.frustumCulled = false }],
  ])('keeps incompatible %s separate', (_, change) => {
    const root = pair()
    const different = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    different.name = 'different'
    different.position.x = 8
    change(different)
    root.add(different)
    const result = optimizeBatchSnapshot(root)
    expect(result.report).toMatchObject({ sourceMeshes: 3, resultMeshes: 2, groups: 1, instances: 2, skippedMeshes: 1 })
    const retained = result.root.getObjectByName('different')
    expect(retained.geometry).toBe(different.geometry)
    expect(retained.material).toBe(different.material)
  })

  it('retains transparent, canvas-textured and multi-material parts while batching opaque parts', () => {
    const root = pair()
    const signTexture = new THREE.CanvasTexture({ width: 32, height: 32 })
    const materials = [
      new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5, depthWrite: false }),
      new THREE.MeshStandardMaterial({ map: signTexture }),
      [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ color: 'red' })],
    ]
    materials.forEach((material, i) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material)
      mesh.name = `retained-${i}`
      root.add(mesh)
    })
    const result = optimizeBatchSnapshot(root)
    expect(result.report).toMatchObject({ sourceMeshes: 5, resultMeshes: 4, skippedMeshes: 3 })
    materials.forEach((material, i) => {
      expect(result.root.getObjectByName(`retained-${i}`).material).toEqual(material)
    })
    expect(result.root.getObjectByName('retained-1').material.map).toBe(signTexture)
  })

  it.each(['negative', 'singular', 'shear', 'instance shear', 'world shear'])('leaves %s transforms unbatched', kind => {
    const root = pair()
    const bad = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1)
    bad.name = 'unsupported-transform'
    bad.position.x = 12
    if (kind === 'negative') bad.scale.x = -1
    if (kind === 'singular') bad.scale.x = 0
    if (kind === 'shear') { bad.updateMatrix(); bad.matrixAutoUpdate = false; bad.matrix.elements[4] = 0.3 }
    if (kind === 'instance shear') {
      const matrix = new THREE.Matrix4()
      matrix.elements[4] = 0.3
      bad.setMatrixAt(0, matrix)
    }
    if (kind === 'world shear') {
      const group = new THREE.Group()
      group.scale.set(2, 1, 1)
      bad.rotation.z = 0.5
      group.add(bad)
      root.add(group)
    } else root.add(bad)
    const result = optimizeBatchSnapshot(root)
    expect(result.report).toMatchObject({ resultMeshes: 2, instances: 2, skippedMeshes: 1 })
    expect(result.root.getObjectByName(bad.name).isInstancedMesh).toBe(true)
    expectSameRendering(renderInputs(root), renderInputs(result.root))
  })

  it('keeps hidden ancestor parts hidden and distinct group render orders intact', () => {
    const root = pair()
    const hidden = pair()
    hidden.visible = false
    const ordered = pair()
    ordered.renderOrder = 7
    ordered.position.x = 20
    root.add(hidden, ordered)
    const before = renderInputs(root)
    const result = optimizeBatchSnapshot(root)
    expectSameRendering(before, renderInputs(result.root))
    const visible = []
    result.root.traverseVisible(node => { if (node.isMesh) visible.push(node) })
    expect(visible).toHaveLength(2)
    expect(visible.find(mesh => mesh.parent.renderOrder === 7)).toBeDefined()
  })

  it.each([
    ['depth testing disabled', { depthTest: false }],
    ['depth writing disabled', { depthWrite: false }],
    ['nonstandard depth function', { depthFunc: THREE.AlwaysDepth }],
    ['additive blending', { blending: THREE.AdditiveBlending }],
    ['custom blending', { blending: THREE.CustomBlending }],
    ['color writing disabled', { colorWrite: false }],
  ])('skips the whole layout for opaque %s, including already excluded textured parts', (_, settings) => {
    const root = pair()
    const material = new THREE.MeshStandardMaterial({ ...settings, map: new THREE.Texture() })
    const excluded = new THREE.Mesh(new THREE.BoxGeometry(), material)
    root.add(excluded)
    const originalChildren = [...root.children]
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    expect(result.report).toMatchObject({ sourceMeshes: 3, resultMeshes: 3, groups: 0, instances: 0 })
    expect(result.report.reason).toMatch(/order|opaque/i)
    expect(root.children).toEqual(originalChildren)
  })

  it('keeps the reviewer red/blue/red material-ID ordering when the blue draw is excluded', () => {
    const root = new THREE.Group()
    const redA = new THREE.MeshBasicMaterial({ color: 'red' })
    const blue = new THREE.MeshBasicMaterial({ color: 'blue', depthTest: false, depthWrite: false })
    const redB = redA.clone()
    const geometry = new THREE.PlaneGeometry(2, 2)
    const materials = [redA, blue, redB]
    materials.forEach((material, index) => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.z = index - 1
      root.add(mesh)
    })
    expect(opaqueDrawColors(root)).toEqual(['ff0000', '0000ff', 'ff0000'])
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    expect(opaqueDrawColors(result.root ?? root)).toEqual(['ff0000', '0000ff', 'ff0000'])
    expect(result.report.reason).toMatch(/order/i)
  })

  it.each([
    ['transparent glass', { transparent: true, opacity: 0.5, depthWrite: false }],
    ['transparent depth override', { transparent: true, depthTest: false, depthFunc: THREE.AlwaysDepth }],
    ['transparent blending', { transparent: true, blending: THREE.AdditiveBlending }],
    ['transmissive glass', { transmission: 1, depthWrite: false }],
  ])('retains %s without unnecessarily disabling opaque batching', (_, settings) => {
    const root = pair()
    const material = new THREE.MeshPhysicalMaterial(settings)
    const excluded = new THREE.Mesh(new THREE.BoxGeometry(), material)
    excluded.name = 'glass'
    root.add(excluded)
    const result = optimizeBatchSnapshot(root)
    expect(result.report).toMatchObject({ resultMeshes: 2, groups: 1, instances: 2, reason: null })
    expect(result.root.getObjectByName('glass').material).toBe(material)
    result.dispose()
  })

  it.each([false, true])('skips whole-layout stencil interactions (transparent=%s)', transparent => {
    const root = pair()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent, stencilWrite: true })))
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    expect(result.report.reason).toMatch(/stencil|order/i)
  })

  it.each(['nested', 'outside root'])('skips camera-dependent Group layer ordering %s', location => {
    const root = pair()
    const group = new THREE.Group()
    group.layers.set(2)
    group.renderOrder = 7
    if (location === 'nested') { group.add(...root.children.slice()); root.add(group) }
    else group.add(root)
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    expect(result.report.reason).toMatch(/group|layer|camera/i)
    expect(result.report).toMatchObject({ sourceMeshes: 2, resultMeshes: 2, groups: 0 })
  })

  it('keeps the reviewer layer-1 Group order invisible to the layer-0 camera', () => {
    const root = new THREE.Group()
    const redGroup = new THREE.Group()
    redGroup.layers.set(1)
    redGroup.renderOrder = 7
    const geometry = new THREE.PlaneGeometry(2, 2)
    redGroup.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 'red' })),
      new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 'red' })))
    const blueGroup = new THREE.Group()
    blueGroup.renderOrder = 3
    blueGroup.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 'blue' })))
    root.add(redGroup, blueGroup)
    const camera = new THREE.PerspectiveCamera()
    camera.layers.set(0)
    expect(opaqueDrawColors(root, camera)).toEqual(['ff0000', 'ff0000', '0000ff'])
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    expect(opaqueDrawColors(result.root ?? root, camera)).toEqual(['ff0000', 'ff0000', '0000ff'])
    expect(result.report.reason).toMatch(/layer/i)
  })

  it('skips a whole animated layout', () => {
    const result = optimizeBatchSnapshot(pair(), { hasAnimation: true })
    expect(result.root).toBeNull()
    expect(result.report.reason).toMatch(/animat/i)
  })

  it.each(['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow'])('skips all nodes for an object %s hook', hook => {
    const root = pair()
    const group = new THREE.Group()
    group[hook] = () => { root.children[0].position.x++ }
    root.add(group)
    const result = optimizeBatchSnapshot(root)
    expect(result.root).toBeNull()
    expect(result.report.reason).toMatch(/hook|callback/i)
  })

  it.each(['onBeforeRender', 'onBeforeCompile', 'customProgramCacheKey'])('skips all nodes for a material %s hook, even on excluded parts', hook => {
    const root = pair()
    const material = new THREE.MeshStandardMaterial({ transparent: true })
    material[hook] = () => {}
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), material))
    const result = optimizeBatchSnapshot(root)
    expect(result.root).toBeNull()
    expect(result.report.reason).toMatch(/hook|callback/i)
  })

  it('detects prototype hooks installed after module initialization', () => {
    const original = THREE.Object3D.prototype.onBeforeRender
    try {
      THREE.Object3D.prototype.onBeforeRender = () => {}
      expect(optimizeBatchSnapshot(pair()).root).toBeNull()
    } finally { THREE.Object3D.prototype.onBeforeRender = original }
  })

  it.each([
    ['object matrix updater', root => { root.children[0].updateMatrixWorld = () => { root.children[1].visible = false } }],
    ['geometry bounds callback', root => { root.children[0].geometry.computeBoundingSphere = () => { root.children[1].visible = false } }],
    ['attribute upload callback', root => { root.children[0].geometry.attributes.position.onUpload(() => { root.children[1].visible = false }) }],
    ['interleaved upload callback', root => {
      const data = new THREE.InterleavedBuffer(new Float32Array(72), 3)
      data.onUpload(() => { root.children[1].visible = false })
      root.children[0].geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0))
    }],
  ])('never copies away or invokes a custom %s', (_, configure) => {
    const root = pair()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    configure(root)
    const result = optimizeBatchSnapshot(root)
    expect(result.root).toBeNull()
    expect(result.report.reason).toMatch(/custom|callback|behavior/i)
    expect(root.children[1].visible).toBe(true)
  })

  it('retains custom shadow materials and ordinary line/point geometry unchanged', () => {
    const root = pair()
    const custom = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    custom.name = 'custom-shadow'
    custom.customDepthMaterial = new THREE.MeshDepthMaterial()
    custom.customDistanceMaterial = new THREE.MeshDistanceMaterial()
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 1, 1)]), new THREE.LineBasicMaterial())
    line.name = 'line'
    root.add(custom, line)
    const result = optimizeBatchSnapshot(root)
    expect(result.report.resultMeshes).toBe(2)
    expect(result.root.getObjectByName('custom-shadow').customDepthMaterial).toBe(custom.customDepthMaterial)
    expect(result.root.getObjectByName('custom-shadow').customDistanceMaterial).toBe(custom.customDistanceMaterial)
    expect(result.root.getObjectByName('line').geometry).toBe(line.geometry)
    expect(result.root.getObjectByName('line').material).toBe(line.material)
  })

  it('does not reinterpret normalized integer instance colors as raw floats', () => {
    const root = pair()
    const retained = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1)
    retained.name = 'normalized-colors'
    retained.instanceColor = new THREE.InstancedBufferAttribute(new Uint8Array([255, 128, 0]), 3, true)
    root.add(retained)
    const result = optimizeBatchSnapshot(root)
    expect(result.report).toMatchObject({ resultMeshes: 2, instances: 2 })
    expect(result.root.getObjectByName(retained.name).instanceColor.normalized).toBe(true)
    expect(result.root.getObjectByName(retained.name).instanceColor.array).toEqual(retained.instanceColor.array)
  })

  it.each(['position', 'index'])('retains dynamic geometry %s buffers without batching them', attribute => {
    const root = pair()
    const dynamic = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1)
    dynamic.name = 'dynamic'
    dynamic.setColorAt(0, new THREE.Color('red'))
    const buffer = attribute === 'position' ? dynamic.geometry.attributes.position
      : attribute === 'index' ? dynamic.geometry.index : dynamic[attribute]
    buffer.setUsage(THREE.DynamicDrawUsage)
    root.add(dynamic)
    const result = optimizeBatchSnapshot(root)
    expect(result.report).toMatchObject({ resultMeshes: 2, instances: 2, skippedMeshes: 1 })
    expect(result.root.getObjectByName('dynamic').geometry).toBe(dynamic.geometry)
    expect(result.root.getObjectByName('dynamic').instanceMatrix.usage).toBe(dynamic.instanceMatrix.usage)
  })

  it.each(['instanceMatrix', 'instanceColor'])('skips the whole layout rather than copying stale dynamic %s buffers', attribute => {
    const root = pair()
    const dynamic = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true }), 1)
    dynamic.setColorAt(0, new THREE.Color('red'))
    dynamic[attribute].setUsage(THREE.DynamicDrawUsage)
    root.add(dynamic)
    const originalBuffer = dynamic[attribute]
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    expect(result.report.reason).toMatch(/dynamic|non-static|instance/i)
    expect(result.report).toMatchObject({ sourceMeshes: 3, resultMeshes: 3, groups: 0 })
    originalBuffer.array[0] = 0.25
    expect(dynamic[attribute]).toBe(originalBuffer)
    result.dispose()
  })

  it('keeps later matrix and color mutations live in the reviewer dynamic-instance fixture', () => {
    const root = pair()
    const dynamic = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1)
    dynamic.name = 'live-instance'
    dynamic.setColorAt(0, new THREE.Color('red'))
    dynamic.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    dynamic.instanceColor.setUsage(THREE.DynamicDrawUsage)
    root.add(dynamic)
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    dynamic.setMatrixAt(0, new THREE.Matrix4().makeTranslation(7, 8, 9))
    dynamic.setColorAt(0, new THREE.Color('green'))
    dynamic.instanceMatrix.needsUpdate = true
    dynamic.instanceColor.needsUpdate = true
    const presented = (result.root ?? root).getObjectByName('live-instance')
    expect(presented).toBe(dynamic)
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    presented.getMatrixAt(0, matrix)
    presented.getColorAt(0, color)
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([7, 8, 9])
    expect(color.getHexString()).toBe('008000')
    result.dispose()
  })

  it('returns a bounded-work no-op for too many exact comparisons within a coarse bucket', () => {
    const root = pair()
    // Same layout/length/endpoints, different unsampled normal values: a cheap
    // signature must never be treated as equality or cause unbounded pair scans.
    for (let i = 0; i < 250; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), root.children[0].material)
      mesh.geometry.attributes.normal.array[1] = (i + 1) / 1000
      root.add(mesh)
    }
    const result = optimizeBatchSnapshot(root)
    expect(result.root === null).toBe(true)
    expect(result.report.reason).toMatch(/budget|limit|compar/i)
    expect(root.children).toHaveLength(252)
  })

  it('buckets large sets of independently colored material pairs before exact comparisons', () => {
    const root = new THREE.Group()
    const geometry = new THREE.BoxGeometry()
    for (let i = 0; i < 500; i++) {
      for (let j = 0; j < 2; j++) {
        const material = new THREE.MeshStandardMaterial()
        material.color.setRGB(i / 500, 0.25, 0.75)
        root.add(new THREE.Mesh(geometry, material))
      }
    }
    const result = optimizeBatchSnapshot(root)
    expect(result.report).toMatchObject({ sourceMeshes: 1000, resultMeshes: 500, groups: 500, instances: 1000, reason: null })
    result.dispose()
  })

  it('cleans up partial snapshots when unsupported metadata prevents copying', () => {
    const root = new THREE.Group()
    const retained = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true }), 1)
    root.add(retained, ...pair().children.slice())
    const cyclic = new THREE.Group()
    cyclic.userData.self = cyclic.userData
    root.add(cyclic)
    const originalDispose = THREE.InstancedMesh.prototype.dispatchEvent
    const disposed = []
    const spy = vi.spyOn(THREE.InstancedMesh.prototype, 'dispatchEvent').mockImplementation(function (event) {
      if (event.type === 'dispose') disposed.push(this)
      return originalDispose.call(this, event)
    })
    try {
      const result = optimizeBatchSnapshot(root)
      expect(result.root).toBeNull()
      expect(disposed).toHaveLength(1)
      expect(disposed[0]).not.toBe(retained)
      result.dispose()
      expect(disposed).toHaveLength(1)
    } finally { spy.mockRestore() }
  })

  it.each(['subclass', 'skinning', 'morph', 'shader', 'geometry subclass'])('conservatively skips unsafe %s behavior', kind => {
    const root = pair()
    if (kind === 'subclass') { class CustomMesh extends THREE.Mesh {}; root.add(new CustomMesh()) }
    if (kind === 'skinning') root.add(new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    if (kind === 'morph') root.children[0].geometry.morphAttributes.position = [root.children[0].geometry.attributes.position.clone()]
    if (kind === 'shader') root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial()))
    if (kind === 'geometry subclass') { class CustomGeometry extends THREE.BoxGeometry {}; root.children[0].geometry = new CustomGeometry() }
    const result = optimizeBatchSnapshot(root)
    expect(result.root).toBeNull()
    expect(result.report.reason).toEqual(expect.any(String))
  })

  it('disposes every snapshot instance resource once, even after detachment, without disposing borrowed resources', () => {
    const root = pair()
    const retained = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true }), 2)
    retained.name = 'retained-instances'
    retained.setColorAt(0, new THREE.Color('red'))
    root.add(retained)
    const borrowedDisposed = vi.fn()
    root.traverse(node => {
      node.geometry?.addEventListener('dispose', borrowedDisposed)
      node.material?.addEventListener('dispose', borrowedDisposed)
      if (node.isInstancedMesh) node.addEventListener('dispose', borrowedDisposed)
    })
    const result = optimizeBatchSnapshot(root)
    const instances = meshes(result.root).filter(mesh => mesh.isInstancedMesh)
    expect(instances).toHaveLength(2)
    const cloned = result.root.getObjectByName(retained.name)
    expect(cloned.instanceMatrix.array).not.toBe(retained.instanceMatrix.array)
    expect(cloned.instanceColor.array).not.toBe(retained.instanceColor.array)
    const disposed = instances.map(mesh => {
      const listener = vi.fn()
      mesh.addEventListener('dispose', listener)
      mesh.removeFromParent()
      return listener
    })
    result.dispose()
    result.dispose()
    disposed.forEach(listener => expect(listener).toHaveBeenCalledTimes(1))
    expect(borrowedDisposed).not.toHaveBeenCalled()
  })
})
