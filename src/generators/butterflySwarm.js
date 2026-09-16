import * as THREE from 'three'
import { createRNG } from '../runtime/seedRandom'

/**
 * Creates a seeded swarm with lobed wings hinged along the longitudinal Z axis.
 * @param {Object} params - Generator parameters
 * @param {number} seed - Random seed
 * @param {Object} textures - Optional textures (wingTexture)
 * @returns {{root: THREE.Group, tick: Function, dispose: Function}}
 */
export function createButterflySwarm(params, seed, textures = {}) {
  const {
    count = 10,
    colors = ['#ff6b9d', '#ffd93d', '#6bcbff'],
    flightRadius = 3,
    speed = 1,
    wingSpan = 0.3,
    heightVariation = 1.5
  } = params
  const rng = createRNG(seed)
  const group = new THREE.Group()
  group.name = 'butterflySwarm'
  const butterflies = []
  const materials = new Set()
  const wingTexture = textures.wingTexture
    ? new THREE.TextureLoader().load(textures.wingTexture)
    : null
  if (wingTexture) wingTexture.colorSpace = THREE.SRGBColorSpace

  // One continuous fore/hindwing silhouette; local X is span, -Z is forward.
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.3)
  shape.bezierCurveTo(0.35, 0.7, 0.95, 0.78, 1, 0.38)
  shape.bezierCurveTo(0.98, 0.16, 0.7, 0.02, 0.48, -0.03)
  shape.bezierCurveTo(0.95, -0.12, 0.8, -0.6, 0.45, -0.52)
  shape.bezierCurveTo(0.12, -0.5, 0.04, -0.23, 0, -0.18)
  shape.closePath()
  const wingGeometry = new THREE.ShapeGeometry(shape, 6)
  // Normalize UVs independently of world wing size for uploaded patterns.
  const positions = wingGeometry.attributes.position
  const uv = wingGeometry.attributes.uv
  const shades = []
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    uv.setXY(i, x, (y + 0.6) / 1.38)
    const shade = 1 - 0.35 * Math.pow(x, 3)
    shades.push(shade, shade, shade)
  }
  wingGeometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3))
  wingGeometry.scale(wingSpan, wingSpan, 1)
  wingGeometry.rotateX(-Math.PI / 2)
  const bodyGeometry = new THREE.SphereGeometry(wingSpan * 0.055, 8, 6)
  bodyGeometry.scale(1, 1, 6.2)
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x282321, roughness: 0.85 })
  materials.add(bodyMaterial)

  for (let i = 0; i < count; i++) {
    const butterfly = new THREE.Group()
    butterfly.name = `butterfly_${i}`
    const color = rng.pick(colors)
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: wingTexture ? 0xffffff : color,
      map: wingTexture,
      vertexColors: !wingTexture,
      side: THREE.DoubleSide,
      alphaTest: wingTexture ? 0.1 : 0,
      roughness: 0.75,
      metalness: 0
    })
    materials.add(wingMaterial)
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial)
    leftWing.name = 'leftWing'
    leftWing.position.x = wingSpan * 0.035
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial)
    rightWing.name = 'rightWing'
    rightWing.scale.x = -1
    rightWing.position.x = -leftWing.position.x
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.name = 'body'
    butterfly.add(leftWing, rightWing, body)
    group.add(butterfly)
    butterflies.push({
      mesh: butterfly, leftWing, rightWing,
      angle: rng.range(0, Math.PI * 2),
      radius: rng.range(0.25, 0.8) * flightRadius,
      radiusWobble: flightRadius * rng.range(0.03, 0.12),
      height: 0.5 + heightVariation * rng.range(0.2, 0.8),
      bob: heightVariation * 0.15,
      orbitSpeed: rng.range(0.3, 0.8),
      verticalSpeed: rng.range(0.5, 1.5),
      flapSpeed: rng.range(8, 15),
      phase: rng.range(0, Math.PI * 2)
    })
  }

  function tick(time) {
    const t = time * speed
    for (const b of butterflies) {
      const flap = 0.2 + Math.sin(t * b.flapSpeed + b.phase) * 0.75
      b.leftWing.rotation.z = flap
      b.rightWing.rotation.z = -flap
      const angle = b.angle + t * b.orbitSpeed
      const radius = b.radius + Math.sin(t * 0.5 + b.phase) * b.radiusWobble
      const radialVelocity = Math.cos(t * 0.5 + b.phase) * b.radiusWobble * 0.5
      b.mesh.position.set(
        Math.cos(angle) * radius,
        b.height + Math.sin(t * b.verticalSpeed + b.phase) * b.bob,
        Math.sin(angle) * radius
      )
      const dx = Math.cos(angle) * radialVelocity - Math.sin(angle) * radius * b.orbitSpeed
      const dz = Math.sin(angle) * radialVelocity + Math.cos(angle) * radius * b.orbitSpeed
      b.mesh.rotation.y = Math.atan2(-dx, -dz)
      b.mesh.rotation.z = Math.sin(t * b.orbitSpeed * 2 + b.phase) * 0.12
    }
  }

  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
    wingGeometry.dispose()
    bodyGeometry.dispose()
    wingTexture?.dispose()
    materials.forEach(material => material.dispose())
  }

  tick(0)
  return { root: group, tick, dispose }
}
