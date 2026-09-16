import { createButterflySwarm } from './butterflySwarm'
import { createProceduralTree } from './proceduralTree'
import { createParticleSystem } from './particleSystem'
import { createSimpleBuilding } from './simpleBuilding'
import { createRockCluster } from './rockCluster'
import { createBuildingModular } from './buildingModular'
import { createEnvironmentScatter } from './environmentScatter'

/**
 * Registry of all available generators
 */
export const generators = {
  butterflySwarm: createButterflySwarm,
  proceduralTree: createProceduralTree,
  particleSystem: createParticleSystem,
  simpleBuilding: createSimpleBuilding,
  rockCluster: createRockCluster,
  buildingModular: createBuildingModular,
  environmentScatter: createEnvironmentScatter
}

/**
 * Get a generator by name
 * @param {string} name 
 * @returns {Function|null}
 */
export function getGenerator(name) {
  return generators[name] || null
}

/**
 * Get all generator names
 * @returns {string[]}
 */
export function getGeneratorNames() {
  return Object.keys(generators)
}
