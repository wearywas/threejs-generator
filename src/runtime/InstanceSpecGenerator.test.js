import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

import { detectAssetStructure, generateInstanceSpec, mergeMeshDefinitionsByMaterial } from './InstanceSpecAnalysis'

const batchedHouseCode = `function createAsset(THREE) {
  const root = new THREE.Group()
  root.position.set(30, 10, -20)
  const wing = new THREE.Group()
  wing.position.set(10, 0, 2)
  wing.rotation.y = Math.PI / 2
  root.add(wing)
  const geometry = new THREE.BoxGeometry(1, 2, 0.2)
  const material = new THREE.MeshStandardMaterial()
  const windows = new THREE.InstancedMesh(geometry, material, 12)
  windows.name = 'frontWindows'
  windows.position.set(0, 1, 0)
  for (let i = 0; i < 12; i++) {
    const part = new THREE.Object3D()
    part.position.set(i * 2, 0, 0)
    part.scale.set(2, 1, 1)
    part.updateMatrix()
    windows.setMatrixAt(i, part.matrix)
  }
  wing.add(windows)
  const backWindow = new THREE.Mesh(geometry, material)
  backWindow.position.set(-4, 2, -3)
  root.add(backWindow)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 12), material)
  roof.position.set(0, 5, 0)
  root.add(roof)
  const shrubs = [Math.random(), Math.random()]
  return { root }
}`

describe('generateInstanceSpec', () => {
  it.each(['roughness', 'metalness', 'emissiveIntensity'])('preserves different %s values in hierarchical instance groups', async property => {
    const spec = await generateInstanceSpec(`function createAsset(THREE) {
      const root = new THREE.Group()
      const geometry = new THREE.BoxGeometry()
      for (let group = 0; group < 2; group++) {
        const material = new THREE.MeshStandardMaterial({
          color: 0x808080, emissive: 0x202020, ${property}: group === 0 ? 0.1 : 0.9
        })
        const panels = new THREE.InstancedMesh(geometry, material, 12)
        panels.name = 'wallPanels'
        for (let i = 0; i < 12; i++) {
          panels.setMatrixAt(i, new THREE.Matrix4().makeTranslation(group * 20 + i, 0, 0))
        }
        root.add(panels)
      }
      return { root }
    }`)

    expect(spec.structureType).toBe('hierarchical')
    expect(spec.meshes.map(mesh => mesh.material[property])).toEqual([0.1, 0.9])
    const generate = new Function(`return (${spec.instanceGeneratorCode})`)()
    const transforms = generate(12345, {})
    expect(transforms).toHaveLength(24)
    expect(transforms[0]).toMatchObject({ meshId: spec.meshes[0].id, position: [0, 0, 0] })
    expect(transforms[12]).toMatchObject({ meshId: spec.meshes[1].id, position: [20, 0, 0] })
    expect(spec.meshes.map(mesh => mesh.instanceCountHint)).toEqual([12, 12])
  })

  it('keeps a static material-batched house hierarchical', async () => {
    const spec = await generateInstanceSpec(batchedHouseCode)

    expect(spec.structureType).toBe('hierarchical')
    expect(spec.animation.type).toBe('none')
  })

  it.each([true, false])('preserves every batched house part and mesh mapping (merge=%s)', async mergeMeshesByMaterial => {
    const spec = await generateInstanceSpec(batchedHouseCode, { mergeMeshesByMaterial })
    const generate = new Function(`return (${spec.instanceGeneratorCode})`)()
    const transforms = generate(12345, {})

    expect(transforms).toHaveLength(14)
    expect(transforms[0].position).toEqual([10, 1, 2])
    expect(transforms[11].position).toEqual([10, 1, -20])
    expect(transforms[0].rotation[1]).toBeCloseTo(Math.PI / 2, 3)
    expect(transforms[0].scale).toEqual([2, 1, 1])
    expect(transforms[12].position).toEqual([-4, 2, -3])
    expect(transforms[13].position).toEqual([0, 5, 0])
    expect(spec.meshes).toHaveLength(mergeMeshesByMaterial ? 2 : 3)
    for (const mesh of spec.meshes) {
      expect(transforms.filter(part => part.meshId === mesh.id)).toHaveLength(mesh.instanceCountHint)
    }
    expect(generate(999, { clumpRadius: 100 })).toEqual(transforms)
  })

  it('uses runtime animation capability instead of the static factory fallback callbacks', async () => {
    const spec = await generateInstanceSpec(`function createAsset(THREE) {
      const root = new THREE.Group()
      const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
      root.add(frontWindow)
      const shrubs = [Math.random(), Math.random()]
      return { root }
    }`)

    expect(spec.animation.type).toBe('none')
  })

  it('does not mistake windows or unrelated factory text for a known animation', async () => {
    const spec = await generateInstanceSpec(`function createAsset(THREE) {
      const root = new THREE.Group()
      const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
      root.add(frontWindow)
      const windSpeed = 3
      const shrubs = [Math.random(), Math.random()]
      return { root, update(time) { frontWindow.position.y = Math.sin(time) } }
    }`)

    expect(spec.animation.type).toBe('custom')
  })

  it.each([
    ['update', 'windSpeed', 'wind'],
    ['tick', 'swayAmount', 'wind'],
    ['update', 'waveHeight', 'wave'],
    ['tick', 'flutterSpeed', 'flutter'],
    ['update', 'orbitRadius', 'orbit'],
  ])('recognizes %s animation using %s in the live callback', async (callback, parameter, expected) => {
    const spec = await generateInstanceSpec(`function createAsset(THREE) {
      const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
      const ${parameter} = 1
      return { root, ${callback}(time) { root.position.x = Math.sin(time) * ${parameter} } }
    }`)

    expect(spec.animation.type).toBe(expected)
  })

  it('releases the template when material analysis throws', async () => {
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    try {
      await expect(generateInstanceSpec(`function createAsset(THREE) {
        const root = new THREE.Group()
        root.add(new THREE.Mesh(new THREE.BoxGeometry(), null))
        return { root }
      }`)).rejects.toThrow()
      expect(dispose).toHaveBeenCalledTimes(1)
    } finally { dispose.mockRestore() }
  })
  it('sanitizes invalid names before validation', async () => {
    const code = `
function createAsset(THREE, seed, textures, params) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x808080 })
  );
  mesh.position.y = 0.5;
  group.add(mesh);
  return { root: group, dispose: () => {} };
}`

    const spec = await generateInstanceSpec(code, {
      name: () => 'bad name'
    })

    expect(typeof spec.name).toBe('string')
    expect(spec.name).toBeTruthy()
  })
})

describe('detectAssetStructure', () => {
  it.each(['', 'frontWindows', 'wallPanels', 'randomShrubs'])('keeps ambiguous instanced assemblies intact (%s)', name => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 24)
    mesh.name = name
    try {
      expect(detectAssetStructure(mesh)).toBe('hierarchical')
    } finally { mesh.geometry.dispose(); mesh.material.dispose() }
  })

  it('still recognizes a clearly named instanced grass field', () => {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial(), 24)
    mesh.name = 'grassBlades'
    try {
      expect(detectAssetStructure(mesh)).toBe('distributed')
    } finally { mesh.geometry.dispose(); mesh.material.dispose() }
  })

  it('does not scatter an assembly just because it includes grass', () => {
    const root = new THREE.Group()
    const grass = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial(), 24)
    grass.name = 'grassBlades'
    const house = new THREE.Mesh(new THREE.BoxGeometry(), grass.material)
    root.add(grass, house)
    try {
      expect(detectAssetStructure(root)).toBe('hierarchical')
    } finally { grass.geometry.dispose(); house.geometry.dispose(); grass.material.dispose() }
  })
})

describe('mergeMeshDefinitionsByMaterial', () => {
  it.each([
    ['roughness', 0.1, 0.9],
    ['metalness', 0.1, 0.9],
    ['emissiveIntensity', 0, 1],
    ['map', 'brick.png', 'wood.png'],
    ['normalMap', 'brick-normal.png', 'wood-normal.png'],
    ['roughnessMap', 'brick-roughness.png', 'wood-roughness.png'],
    ['customShader',
      { vertexShader: 'vertex', fragmentShader: 'fragment', uniforms: { strength: { value: 1 } } },
      { vertexShader: 'vertex', fragmentShader: 'fragment', uniforms: { strength: { value: 2 } } },
    ],
  ])('keeps serialized %s differences in separate material groups', (property, first, second) => {
    const meshDefinitions = [first, second].map((value, index) => ({
      id: `mesh_${index}`,
      geometry: { type: 'box', width: 1, height: 1, depth: 1 },
      material: { color: '#808080', side: 'front', transparent: false, opacity: 1, [property]: value },
      instanceCountHint: 12,
    }))

    const result = mergeMeshDefinitionsByMaterial(meshDefinitions)

    expect(result.mergedMeshDefinitions.map(mesh => mesh.material[property])).toEqual([first, second])
    expect(result.mapping.get('mesh_0')).not.toBe(result.mapping.get('mesh_1'))
    expect(result.mergedMeshDefinitions.map(mesh => mesh.instanceCountHint)).toEqual([12, 12])
  })

  it('still merges identical complete material definitions including nested shader values', () => {
    const material = {
      color: '#808080', roughness: 0.1, metalness: 0.9, emissiveIntensity: 2,
      map: 'metal.png', normalMap: 'metal-normal.png', roughnessMap: 'metal-roughness.png',
      customShader: { vertexShader: 'vertex', fragmentShader: 'fragment', uniforms: { strength: { value: 1 } } },
    }
    const result = mergeMeshDefinitionsByMaterial([
      { id: 'mesh_a', geometry: { type: 'box' }, material, instanceCountHint: 12 },
      { id: 'mesh_b', geometry: { type: 'box' }, material: structuredClone(material), instanceCountHint: 24 },
    ])

    expect(result.mergedMeshDefinitions).toHaveLength(1)
    expect(result.mergedMeshDefinitions[0]).toMatchObject({ material, instanceCountHint: 36 })
    expect(result.mapping.get('mesh_a')).toBe(result.mapping.get('mesh_b'))
  })

  it('does not collapse distinct geometries that only share material color', () => {
    const meshDefinitions = [
      {
        id: 'mesh_a',
        name: 'wall',
        geometry: { type: 'box', width: 2, height: 2, depth: 0.2 },
        material: { color: '#aaaaaa', side: 'front', transparent: false, opacity: 1 }
      },
      {
        id: 'mesh_b',
        name: 'roof',
        geometry: { type: 'cone', radius: 1, height: 2, radialSegments: 8 },
        material: { color: '#aaaaaa', side: 'front', transparent: false, opacity: 1 }
      }
    ]

    const result = mergeMeshDefinitionsByMaterial(meshDefinitions)

    expect(result.mergedMeshDefinitions).toHaveLength(2)
    expect(result.mapping.get('mesh_a')).not.toBe(result.mapping.get('mesh_b'))
  })
})
