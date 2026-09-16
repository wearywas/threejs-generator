import * as THREE from 'three'
import { createRNG, createNoise2D } from '../runtime/seedRandom'
import { createAssetDisposer } from '../runtime/assetDisposal'

/**
 * Creates grounded, closed low-poly boulders with surface-following moss.
 * @param {Object} params - Generator parameters
 * @param {number} seed - Random seed
 * @param {Object} textures - Optional rockTexture and mossTexture images
 * @returns {{root: THREE.Group, tick: null, dispose: Function}}
 */
export function createRockCluster(params, seed, textures = {}) {
  const {
    count = 5, minSize = 0.3, maxSize = 1.5, spread = 3,
    color = '#808080', roughness = 0.8, mossAmount = 0.2, mossColor = '#3a5f0b',
  } = params
  const rng = createRNG(seed)
  const noise = createNoise2D(seed + 1000)
  const group = new THREE.Group()
  group.name = 'rockCluster'
  const loader = new THREE.TextureLoader()
  const loadTexture = source => {
    if (!source) return null
    const texture = loader.load(source)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    return texture
  }
  const rockTexture = loadTexture(textures.rockTexture)
  const mossTexture = loadTexture(textures.mossTexture)
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: rockTexture ? 0xffffff : color, map: rockTexture,
    roughness, metalness: 0, flatShading: true,
  })
  const mossMaterial = new THREE.MeshStandardMaterial({
    color: mossTexture ? 0xffffff : mossColor, map: mossTexture,
    alphaTest: mossTexture ? 0.5 : 0, roughness: 1, metalness: 0,
    flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
  const geometries = new Set()
  const placed = []
  const low = Math.min(minSize, maxSize)
  const high = Math.max(minSize, maxSize)

  const makeStone = (size, detail, name) => {
    const geometry = new THREE.IcosahedronGeometry(size, detail)
    deformRock(geometry, noise, size, rng.range(0, 100))
    geometry.scale(rng.range(0.88, 1.18), rng.range(0.52, 0.78), rng.range(0.85, 1.12))
    geometry.computeVertexNormals()
    geometries.add(geometry)
    const stone = new THREE.Mesh(geometry, rockMaterial)
    stone.name = name
    stone.rotation.set(rng.range(-0.12, 0.12), rng.range(0, Math.PI * 2), rng.range(-0.12, 0.12))
    stone.castShadow = stone.receiveShadow = true
    return stone
  }

  for (let i = 0; i < count; i++) {
    const size = i === 0 ? rng.range(Math.max(low, high * 0.8), high) : rng.range(low, high)
    const rock = makeStone(size, size > 0.65 ? 2 : 1, `rock_${i}`)
    // Choose the least crowded of a bounded set of seeded placements.
    let best = { x: 0, y: 0 }
    let bestClearance = -Infinity
    for (let attempt = 0; attempt < 32; attempt++) {
      const candidate = rng.pointInCircle(spread / 2)
      const clearance = placed.length
        ? Math.min(...placed.map(other => Math.hypot(candidate.x - other.x, candidate.y - other.z) - size - other.size))
        : -Math.hypot(candidate.x, candidate.y)
      if (clearance > bestClearance) { best = candidate; bestClearance = clearance }
    }
    rock.position.set(best.x, 0, best.y)
    groundStone(rock)
    group.add(rock)
    placed.push({ x: best.x, z: best.y, size })
    if (mossAmount > 0) {
      const geometry = createMossGeometry(rock, mossAmount, noise, size, i * 17)
      if (geometry) {
        geometries.add(geometry)
        const moss = new THREE.Mesh(geometry, mossMaterial)
        moss.name = `moss_${i}`
        moss.castShadow = moss.receiveShadow = true
        rock.add(moss)
      }
    }
  }

  for (let i = 0; i < count * 2; i++) {
    const size = rng.range(low * 0.12, low * 0.28)
    const pebble = makeStone(size, 0, `pebble_${i}`)
    const angle = rng.range(0, Math.PI * 2)
    const distance = rng.range(spread * 0.4, spread * 0.66)
    pebble.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
    groundStone(pebble)
    group.add(pebble)
  }

  const dispose = createAssetDisposer({ dispose() {
    geometries.forEach(geometry => geometry.dispose())
    rockMaterial.dispose()
    mossMaterial.dispose()
    rockTexture?.dispose()
    mossTexture?.dispose()
  } })
  return { root: group, tick: null, dispose }
}

function deformRock(geometry, noise, size, offset) {
  const positions = geometry.attributes.position
  const displaced = new Map()
  for (let i = 0; i < positions.count; i++) {
    // Icosahedra duplicate vertices at triangle/UV seams. Every copy of a
    // position must receive exactly the same displacement or the shell tears.
    const point = new THREE.Vector3().fromBufferAttribute(positions, i).divideScalar(size)
    const key = point.toArray().map(value => Math.round(value * 1e6)).join(',')
    if (!displaced.has(key)) {
      const n = noise(point.x * 1.4 + offset, point.z * 1.4)
        + noise(point.y * 1.8, point.x * 1.8 + offset) * 0.45
      point.multiplyScalar(size * (1 + n * 0.16))
      displaced.set(key, point)
    }
    const vertex = displaced.get(key)
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z)
  }
  positions.needsUpdate = true
}

function groundStone(stone) {
  const positions = stone.geometry.attributes.position
  let bottom = Infinity
  for (let i = 0; i < positions.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyQuaternion(stone.quaternion)
    bottom = Math.min(bottom, point.y)
  }
  stone.position.y = -bottom
}

function createMossGeometry(rock, amount, noise, size, offset) {
  const positions = rock.geometry.attributes.position
  const uv = rock.geometry.attributes.uv
  const output = [], uvs = []
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const normal = new THREE.Vector3(), center = new THREE.Vector3()
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i)
    b.fromBufferAttribute(positions, i + 1)
    c.fromBufferAttribute(positions, i + 2)
    normal.subVectors(b, a).cross(c.clone().sub(a)).normalize().applyQuaternion(rock.quaternion)
    center.copy(a).add(b).add(c).divideScalar(3)
    const elevation = center.clone().applyQuaternion(rock.quaternion).y / size
    const border = 0.62 - amount * 0.9 + noise(center.x / size * 2 + offset, center.z / size * 2) * 0.15
    if (normal.y < 0.15 || elevation < border) continue
    for (let j = 0; j < 3; j++) {
      // Reuse the actual face, offset very slightly from the underlying stone.
      const point = new THREE.Vector3().fromBufferAttribute(positions, i + j).multiplyScalar(1.003)
      output.push(...point.toArray())
      uvs.push(uv.getX(i + j), uv.getY(i + j))
    }
  }
  if (!output.length) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}
