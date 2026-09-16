import * as THREE from 'three'
import { generators, getGenerator } from '../generators'
import { validateSpec } from '../schemas/assetSpec'
import { createAssetDisposer } from './assetDisposal'

/**
 * @typedef {Object} AssetManifest
 * @property {string} generator - Name of the generator used
 * @property {Object} params - Generator parameters
 * @property {number} seed - Random seed for determinism
 * @property {{size: [number, number, number], pivot: 'base' | 'center'}} bounds - Bounding info
 */

/**
 * @typedef {Object} AssetInstance
 * @property {THREE.Object3D} root - The visual object to add to scene
 * @property {((time: number, delta: number) => void)?} tick - Optional animation update
 * @property {() => void} dispose - Cleanup function
 * @property {AssetManifest} manifest - Metadata for export
 */

/**
 * Creates an asset instance from a validated spec.
 * @param {Object} spec - The asset specification (includes optional textures)
 * @returns {AssetInstance}
 */
export function createAsset(spec) {
  // Validate the spec (without textures which are passed separately)
  const { textures, ...specWithoutTextures } = spec
  const validatedSpec = validateSpec(specWithoutTextures)
  
  // Get the generator
  const generator = getGenerator(validatedSpec.generator)
  if (!generator) {
    throw new Error(`Unknown generator: ${validatedSpec.generator}`)
  }
  
  // Create the asset using the generator (pass textures if available)
  const result = generator(validatedSpec.params, validatedSpec.seed, textures || {})
  
  // Calculate bounds
  const bounds = calculateBounds(result.root)
  
  // Build the manifest
  const manifest = {
    generator: validatedSpec.generator,
    params: validatedSpec.params,
    seed: validatedSpec.seed,
    bounds,
    hasTextures: textures && Object.keys(textures).length > 0
  }
  
  // Return the asset instance
  return {
    root: result.root,
    tick: result.tick || null,
    hasAnimation: typeof result.tick === 'function' || typeof result.update === 'function',
    dispose: createAssetDisposer(result),
    manifest
  }
}

/**
 * Calculate bounds of an object
 */
function calculateBounds(object) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  
  // Determine pivot type based on object position
  const pivot = Math.abs(box.min.y) < 0.01 ? 'base' : 'center'
  
  return {
    size: [size.x, size.y, size.z],
    pivot
  }
}

/**
 * Get list of available generators
 * @returns {string[]}
 */
export function getAvailableGenerators() {
  return Object.keys(generators)
}

/**
 * Check if a generator exists
 * @param {string} name 
 * @returns {boolean}
 */
export function hasGenerator(name) {
  return !!getGenerator(name)
}
