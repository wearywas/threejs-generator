import React from 'react'

/**
 * Displays statistics about the generated asset
 */
export default function AssetStats({ asset, spec, mode }) {
  if (!asset) {
    return (
      <div className="text-sm text-gray-500 italic">
        Generate an asset to see stats
      </div>
    )
  }

  // Get triangle count from asset (ensure it's rounded)
  const triangleCount = Math.round(asset.triangleCount ?? (asset.isIsolated ? 0 : countTrianglesFromRoot(asset.root)))
  
  // Determine animation status
  const hasAnimation = asset.isIsolated ? asset.hasAnimation : asset.hasAnimation || (typeof asset.tick === 'function' && asset.tick.toString() !== '() => {}')
  
  // Format triangle count
  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  // Get performance rating based on triangle count
  const getPerformanceRating = (tris) => {
    if (tris <= 5000) return { label: 'Excellent', color: 'text-green-400', bgColor: 'bg-green-900/30' }
    if (tris <= 15000) return { label: 'Good', color: 'text-lime-400', bgColor: 'bg-lime-900/30' }
    if (tris <= 50000) return { label: 'Moderate', color: 'text-yellow-400', bgColor: 'bg-yellow-900/30' }
    if (tris <= 100000) return { label: 'Heavy', color: 'text-orange-400', bgColor: 'bg-orange-900/30' }
    return { label: 'Very Heavy', color: 'text-red-400', bgColor: 'bg-red-900/30' }
  }

  const perfRating = getPerformanceRating(triangleCount)

  // Get mode display name
  const getModeDisplay = () => {
    switch (mode) {
      case 'curated': return { label: 'Template', color: 'text-helios-400' }
      case 'creative': return { label: 'Generated code', color: 'text-gray-300' }
      case 'procedural': return { label: 'Editable controls', color: 'text-helios-300' }
      default: return { label: 'Unknown', color: 'text-gray-400' }
    }
  }

  const modeDisplay = getModeDisplay()

  return (
    <div className="space-y-2">
      {/* Triangle Count - Main Stat */}
      <div className={`flex items-center justify-between p-2 rounded ${perfRating.bgColor}`}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <span className="text-sm text-gray-300">Triangles</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-mono font-medium ${perfRating.color}`}>
            {formatNumber(triangleCount)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${perfRating.bgColor} ${perfRating.color}`}>
            {perfRating.label}
          </span>
        </div>
      </div>

      {/* Other Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Mode */}
        <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded">
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span className={`text-xs ${modeDisplay.color}`}>{modeDisplay.label}</span>
        </div>

        {/* Animation */}
        <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded">
          <svg className={`w-3.5 h-3.5 ${hasAnimation ? 'text-cyan-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={`text-xs ${hasAnimation ? 'text-cyan-400' : 'text-gray-500'}`}>
            {hasAnimation ? 'Animated' : 'Static'}
          </span>
        </div>

        {/* Generator (for curated mode) */}
        {spec?.generator && (
          <div className="col-span-2 flex items-center gap-2 p-2 bg-gray-800/50 rounded">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <span className="text-xs text-gray-400">
              Generator: <span className="text-helios-400">{spec.generator}</span>
            </span>
          </div>
        )}

        {/* Seed */}
        {spec?.seed && (
          <div className="col-span-2 flex items-center gap-2 p-2 bg-gray-800/50 rounded">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-xs text-gray-400">
              Seed: <span className="font-mono text-gray-300">{spec.seed}</span>
            </span>
          </div>
        )}

        {/* Addons Used (for creative/procedural mode) */}
        {asset?.usedAddons?.length > 0 && (
          <div className="col-span-2 flex items-center gap-2 p-2 bg-blue-900/30 rounded">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span className="text-xs text-blue-300">
              Addons: <span className="text-blue-400">{asset.usedAddons.join(', ')}</span>
            </span>
          </div>
        )}

        {/* Critic notes (advisory only, never blocks generation) */}
        {asset?.criticEvaluation && !asset.criticEvaluation.accepted && (
          <details className="col-span-2 rounded border border-[var(--studio-border)] p-2 text-xs text-[var(--studio-muted)]">
            <summary className="cursor-pointer font-medium text-[var(--studio-text)]">Geometry hints</summary>
            <p className="mt-2">
              These local checks are heuristic and advisory, not a verdict on asset quality.
              They do not block generation or export.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {asset.criticEvaluation.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}

/**
 * Count triangles from THREE.Object3D root if not already counted
 */
function countTrianglesFromRoot(root) {
  if (!root) return 0
  
  let count = 0
  root.traverse((child) => {
    if (child.isMesh) {
      const geometry = child.geometry
      let meshTriangles = 0
      
      if (geometry.index) {
        meshTriangles = geometry.index.count / 3
      } else if (geometry.attributes.position) {
        meshTriangles = geometry.attributes.position.count / 3
      }
      
      // Account for instancing - multiply THIS mesh's triangles, not total
      if (child.isInstancedMesh) {
        meshTriangles *= child.count
      }
      
      count += meshTriangles
    }
  })
  
  return Math.round(count)
}
