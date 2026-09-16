/**
 * Validate if code can be converted to instance spec
 * Also provides hints about the likely structure type
 */
export function canConvertToInstanceSpec(code) {
  if (!code) return { valid: false, reason: 'No code provided' }

  // Must have createAsset function
  if (!/function\s+createAsset\s*\(/.test(code)) {
    return { valid: false, reason: 'Code must contain a createAsset function' }
  }

  // Check for patterns that indicate batchable assets
  const hasInstancedMesh = /InstancedMesh/.test(code)
  const hasMultipleObjects = /\.add\s*\(/.test(code)

  // Count approximate mesh additions to guess structure
  const addCalls = (code.match(/\.add\s*\(/g) || []).length

  if (!hasInstancedMesh && !hasMultipleObjects) {
    return {
      valid: true,
      reason: 'Simple asset - batching will have minimal benefit',
      recommendation: 'low',
      likelyStructure: 'hierarchical'
    }
  }

  if (hasInstancedMesh) {
    return {
      valid: true,
      reason: 'Asset uses InstancedMesh - batching can preserve its assembled parts; runtime analysis determines structure',
      recommendation: 'high',
      likelyStructure: 'hierarchical'
    }
  }

  // Multiple regular meshes = likely hierarchical (flower, tree, etc.)
  if (addCalls > 3) {
    return {
      valid: true,
      reason: 'Asset creates multiple parts - will be batched as hierarchical unit',
      recommendation: 'medium',
      likelyStructure: 'hierarchical'
    }
  }

  return {
    valid: true,
    reason: 'Asset creates objects - may benefit from batching',
    recommendation: 'medium',
    likelyStructure: 'hierarchical'
  }
}
