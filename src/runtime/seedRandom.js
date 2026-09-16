import seedrandom from 'seedrandom'

/**
 * Creates a seeded random number generator for deterministic procedural generation.
 * Same seed always produces the same sequence of random numbers.
 */
export function createRNG(seed) {
  const rng = seedrandom(String(seed))
  
  return {
    // Get a random float between 0 and 1
    random: () => rng(),
    
    // Get a random float between min and max
    range: (min, max) => min + rng() * (max - min),
    
    // Get a random integer between min (inclusive) and max (exclusive)
    int: (min, max) => Math.floor(min + rng() * (max - min)),
    
    // Pick a random element from an array
    pick: (array) => array[Math.floor(rng() * array.length)],
    
    // Shuffle an array (returns new array)
    shuffle: (array) => {
      const result = [...array]
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
      }
      return result
    },
    
    // Get a random boolean with optional probability (default 0.5)
    bool: (probability = 0.5) => rng() < probability,
    
    // Get a random value with gaussian distribution (Box-Muller transform)
    gaussian: (mean = 0, stdDev = 1) => {
      let u = 0, v = 0
      while (u === 0) u = rng()
      while (v === 0) v = rng()
      const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
      return num * stdDev + mean
    },
    
    // Get a random 2D point within a circle
    pointInCircle: (radius = 1) => {
      const angle = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * radius
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r
      }
    },
    
    // Get a random 3D point within a sphere
    pointInSphere: (radius = 1) => {
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(2 * rng() - 1)
      const r = Math.cbrt(rng()) * radius
      return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi)
      }
    },
    
    // Get a random 3D point on the surface of a sphere
    pointOnSphere: (radius = 1) => {
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(2 * rng() - 1)
      return {
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.sin(phi) * Math.sin(theta),
        z: radius * Math.cos(phi)
      }
    }
  }
}

/**
 * Simple noise function (value noise)
 * Returns consistent values for the same input coordinates
 */
export function createNoise2D(seed) {
  const rng = seedrandom(String(seed))
  const permutation = []
  
  // Generate permutation table
  for (let i = 0; i < 256; i++) {
    permutation[i] = i
  }
  
  // Shuffle permutation table
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[permutation[i], permutation[j]] = [permutation[j], permutation[i]]
  }
  
  // Duplicate for wraparound
  for (let i = 0; i < 256; i++) {
    permutation[256 + i] = permutation[i]
  }
  
  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }
  
  function lerp(a, b, t) {
    return a + t * (b - a)
  }
  
  function grad(hash, x, y) {
    const h = hash & 3
    const u = h < 2 ? x : y
    const v = h < 2 ? y : x
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
  }
  
  return function noise(x, y) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    
    x -= Math.floor(x)
    y -= Math.floor(y)
    
    const u = fade(x)
    const v = fade(y)
    
    const A = permutation[X] + Y
    const B = permutation[X + 1] + Y
    
    return lerp(
      lerp(grad(permutation[A], x, y), grad(permutation[B], x - 1, y), u),
      lerp(grad(permutation[A + 1], x, y - 1), grad(permutation[B + 1], x - 1, y - 1), u),
      v
    )
  }
}
