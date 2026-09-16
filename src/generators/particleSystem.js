import * as THREE from 'three'
import { createRNG } from '../runtime/seedRandom'

/**
 * Creates seeded particles with seekable motion and vertex-color flicker.
 * PointsMaterial intentionally uses a uniform size (including in static exports).
 * @param {Object} params - Generator parameters
 * @param {number} seed - Random seed
 * @param {Object} textures - Optional textures (particleTexture)
 * @returns {{root: THREE.Group, tick: Function, dispose: Function}}
 */
export function createParticleSystem(params, seed, textures = {}) {
  const {
    type = 'fireflies', count = 100, area = 5, color = '#ffff00',
    secondaryColor, speed = 1, size = 0.1, glow = true
  } = params
  const rng = createRNG(seed)
  const group = new THREE.Group()
  group.name = 'particleSystem'
  const particleTexture = textures.particleTexture
    ? new THREE.TextureLoader().load(textures.particleTexture)
    : createRadialTexture()
  if (textures.particleTexture) particleTexture.colorSpace = THREE.SRGBColorSpace
  const primary = new THREE.Color(color)
  const secondary = secondaryColor ? new THREE.Color(secondaryColor) : primary.clone().offsetHSL(0.1, 0, 0)
  const particleData = []
  for (let i = 0; i < count; i++) {
    const angle = rng.range(0, Math.PI * 2)
    const radius = Math.sqrt(rng.random()) * area * 0.32
    particleData.push({
      x: type === 'snow' || type === 'dust' ? rng.range(-area * 0.35, area * 0.35) : Math.cos(angle) * radius,
      z: type === 'snow' || type === 'dust' ? rng.range(-area * 0.35, area * 0.35) : Math.sin(angle) * radius,
      y: rng.range(0, area),
      rate: rng.range(0.5, 1.5),
      phase: rng.range(0, Math.PI * 2),
      orbitRate: rng.range(0.5, 2),
      amplitude: rng.range(0.02, 0.1) * area,
      flickerRate: rng.range(3, 8),
      drift: rng.range(-0.12, 0.12),
      color: (rng.bool(0.3) ? secondary : primary).clone()
    })
  }
  const geometry = new THREE.BufferGeometry()
  const positions = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3)
  const colors = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3)
  positions.setUsage(THREE.DynamicDrawUsage)
  colors.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', positions)
  geometry.setAttribute('color', colors)
  // Bounds cover the entire animated volume, rather than just the first frame.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, area / 2, 0), area * Math.sqrt(3) / 2)
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-area / 2, 0, -area / 2), new THREE.Vector3(area / 2, area, area / 2))
  const material = new THREE.PointsMaterial({
    size, map: particleTexture, vertexColors: true,
    transparent: true, opacity: type === 'dust' ? 0.4 : type === 'snow' ? 0.8 : 0.95,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false, sizeAttenuation: true
  })
  const points = new THREE.Points(geometry, material)
  group.add(points)
  let halo = null
  if (glow && (type === 'fireflies' || type === 'sparkles')) {
    const haloMaterial = material.clone()
    haloMaterial.size = size * 3
    haloMaterial.opacity = 0.16
    // Shared attributes keep position and brightness in lockstep without copies.
    halo = new THREE.Points(geometry, haloMaterial)
    group.add(halo)
  }

  function tick(time) {
    const elapsed = time * speed
    for (let i = 0; i < count; i++) {
      const data = particleData[i]
      const t = elapsed * data.rate
      const angle = t * data.orbitRate + data.phase
      let x = data.x
      let y = data.y
      let z = data.z
      let brightness = 1
      switch (type) {
        case 'snow':
          y = wrap(data.y - t * 0.6, area)
          x = wrap(data.x + t * data.drift + Math.sin(angle) * data.amplitude + area / 2, area) - area / 2
          z = wrap(data.z + t * data.drift * 0.4 + area / 2, area) - area / 2
          break
        case 'embers': {
          y = wrap(data.y + t * 0.9, area)
          const rise = y / area
          x = data.x * (0.3 + rise * 0.7) + Math.sin(angle) * data.amplitude
          z = data.z * (0.3 + rise * 0.7) + Math.cos(angle) * data.amplitude
          // Fade at both cycle ends so respawn doesn't pop; never compound colors.
          brightness = Math.sin(Math.PI * rise) * (0.75 + 0.25 * Math.sin(t * data.flickerRate + data.phase))
          break
        }
        case 'dust':
          x += Math.sin(angle * 0.2) * data.amplitude
          z += Math.cos(angle * 0.16) * data.amplitude
          y = area * 0.1 + data.y * 0.8 + Math.sin(t * 0.3 + data.phase) * area * 0.08
          break
        case 'sparkles':
          x += Math.sin(angle * 0.3) * data.amplitude
          z += Math.cos(angle * 0.3) * data.amplitude
          brightness = 0.08 + 0.92 * Math.pow(Math.sin(t * data.flickerRate + data.phase), 4)
          break
        case 'fireflies':
        default:
          x += Math.sin(angle) * data.amplitude
          z += Math.cos(angle * 0.7) * data.amplitude
          y = area * 0.1 + data.y * 0.8 + Math.sin(t * 0.5 + data.phase) * area * 0.08
          brightness = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * data.flickerRate + data.phase))
          break
      }
      positions.setXYZ(i, x, y, z)
      colors.setXYZ(i, data.color.r * brightness, data.color.g * brightness, data.color.b * brightness)
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
  }

  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
    geometry.dispose()
    material.dispose()
    halo?.material.dispose()
    particleTexture.dispose()
  }
  tick(0)
  return { root: group, tick, dispose }
}

function wrap(value, period) {
  return ((value % period) + period) % period
}

function createRadialTexture() {
  const size = 32
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2))
      const alpha = Math.pow(Math.max(0, 1 - radius * radius), 3)
      const offset = (y * size + x) * 4
      data.set([255, 255, 255, Math.round(alpha * 255)], offset)
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}
