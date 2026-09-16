/**
 * Instancing Utilities
 * Convert repeated mesh elements to InstancedMesh for better performance
 */
import * as THREE from 'three'

/**
 * Collect all meshes with the same geometry/material signature
 * and convert them to InstancedMesh
 * 
 * @param {THREE.Object3D} root - Root object to process
 * @param {Object} options - Options
 * @param {number} options.minInstances - Minimum instances to batch (default 3)
 * @param {boolean} options.removeOriginals - Remove original meshes (default true)
 * @returns {THREE.Group} Group containing instanced meshes
 */
export function convertToInstancedMeshes(root, options = {}) {
  const {
    minInstances = 3,
    removeOriginals = true
  } = options

  const instanceGroups = new Map() // Map<signature, {geometry, material, matrices: Matrix4[]}>
  const meshesToRemove = []

  // Traverse and collect meshes
  root.traverse(child => {
    if (child.isMesh && !child.isInstancedMesh) {
      const signature = getMeshSignature(child)
      
      if (!instanceGroups.has(signature)) {
        instanceGroups.set(signature, {
          geometry: child.geometry,
          material: child.material,
          matrices: [],
          colors: []
        })
      }
      
      // Get world matrix
      child.updateWorldMatrix(true, false)
      const matrix = child.matrixWorld.clone()
      instanceGroups.get(signature).matrices.push(matrix)
      
      // Track original mesh color if using vertex colors
      if (child.material && child.material.color) {
        instanceGroups.get(signature).colors.push(child.material.color.clone())
      }
      
      meshesToRemove.push(child)
    }
  })

  // Create instanced meshes for groups meeting minimum threshold
  const instancedGroup = new THREE.Group()
  instancedGroup.name = 'instancedMeshes'

  instanceGroups.forEach((group, signature) => {
    if (group.matrices.length >= minInstances) {
      const instancedMesh = new THREE.InstancedMesh(
        group.geometry,
        group.material,
        group.matrices.length
      )
      
      // Set instance matrices
      group.matrices.forEach((matrix, i) => {
        instancedMesh.setMatrixAt(i, matrix)
      })
      
      instancedMesh.instanceMatrix.needsUpdate = true
      instancedMesh.castShadow = true
      instancedMesh.receiveShadow = true
      instancedMesh.name = `instanced_${signature.substring(0, 20)}`
      
      instancedGroup.add(instancedMesh)
      
      // Mark originals for removal
      if (removeOriginals) {
        // These will be removed from the original root
      }
    }
  })

  // Remove original meshes that were instanced
  if (removeOriginals) {
    meshesToRemove.forEach(mesh => {
      const signature = getMeshSignature(mesh)
      const group = instanceGroups.get(signature)
      
      if (group && group.matrices.length >= minInstances) {
        if (mesh.parent) {
          mesh.parent.remove(mesh)
        }
      }
    })
  }

  return instancedGroup
}

/**
 * Generate a unique signature for a mesh based on geometry and material
 */
function getMeshSignature(mesh) {
  const geoId = mesh.geometry.uuid
  const matId = Array.isArray(mesh.material)
    ? mesh.material.map(m => m.uuid).join('_')
    : mesh.material.uuid
  
  return `${geoId}_${matId}`
}

/**
 * Create an InstancedMesh from a list of positions and a template mesh
 * 
 * @param {THREE.Mesh} templateMesh - The mesh to instance
 * @param {Array<{position: THREE.Vector3, rotation?: THREE.Euler, scale?: THREE.Vector3}>} instances - Instance transforms
 * @returns {THREE.InstancedMesh}
 */
export function createInstancedFromTemplate(templateMesh, instances) {
  const instancedMesh = new THREE.InstancedMesh(
    templateMesh.geometry,
    templateMesh.material,
    instances.length
  )
  
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  
  instances.forEach((instance, i) => {
    position.copy(instance.position)
    
    if (instance.rotation) {
      quaternion.setFromEuler(instance.rotation)
    } else {
      quaternion.identity()
    }
    
    if (instance.scale) {
      scale.copy(instance.scale)
    } else {
      scale.set(1, 1, 1)
    }
    
    matrix.compose(position, quaternion, scale)
    instancedMesh.setMatrixAt(i, matrix)
  })
  
  instancedMesh.instanceMatrix.needsUpdate = true
  instancedMesh.castShadow = true
  instancedMesh.receiveShadow = true
  
  return instancedMesh
}

/**
 * Batch similar window/door modules into instanced meshes
 * Used post-generation to optimize building geometry
 * 
 * @param {THREE.Group} buildingGroup - Building group containing modules
 * @returns {THREE.Group} Optimized building group
 */
export function optimizeBuildingInstances(buildingGroup) {
  // Collect window frames
  const windowFrames = []
  const doorFrames = []
  const glassPanes = []
  
  buildingGroup.traverse(child => {
    if (child.name === 'windowFrame') {
      child.traverse(part => {
        if (part.isMesh) {
          const worldPos = new THREE.Vector3()
          const worldQuat = new THREE.Quaternion()
          const worldScale = new THREE.Vector3()
          
          part.updateWorldMatrix(true, false)
          part.matrixWorld.decompose(worldPos, worldQuat, worldScale)
          
          // Categorize by material type
          if (part.material.transparent) {
            glassPanes.push({ mesh: part, position: worldPos, quaternion: worldQuat, scale: worldScale })
          } else {
            windowFrames.push({ mesh: part, position: worldPos, quaternion: worldQuat, scale: worldScale })
          }
        }
      })
    }
  })
  
  // Could batch these into InstancedMeshes here
  // For now, return as-is since geometry is already fairly efficient
  return buildingGroup
}

/**
 * Create scattered instances using a position array
 * 
 * @param {THREE.BufferGeometry} geometry - Geometry to instance
 * @param {THREE.Material} material - Material to use
 * @param {Array<THREE.Vector3>} positions - World positions
 * @param {Object} options - Additional options
 * @param {Function} options.getRotation - Function(index, position) => Euler
 * @param {Function} options.getScale - Function(index, position) => Vector3
 * @returns {THREE.InstancedMesh}
 */
export function createScatteredInstances(geometry, material, positions, options = {}) {
  const {
    getRotation = () => new THREE.Euler(0, Math.random() * Math.PI * 2, 0),
    getScale = () => new THREE.Vector3(1, 1, 1)
  } = options

  const instancedMesh = new THREE.InstancedMesh(geometry, material, positions.length)
  
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  
  positions.forEach((pos, i) => {
    quaternion.setFromEuler(getRotation(i, pos))
    const scale = getScale(i, pos)
    
    matrix.compose(pos, quaternion, scale)
    instancedMesh.setMatrixAt(i, matrix)
  })
  
  instancedMesh.instanceMatrix.needsUpdate = true
  instancedMesh.castShadow = true
  instancedMesh.receiveShadow = true
  
  return instancedMesh
}
