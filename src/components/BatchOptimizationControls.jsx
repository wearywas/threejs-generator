import React from 'react'

/** Reports measurements from the two actual layouts, never instance-spec estimates. */
export default function BatchOptimizationControls({ result, disabled, busy, onSelect }) {
  return (
    <section className="mb-4 pt-4 border-t border-gray-700" aria-label="Layout optimization">
      {!result ? <>
        <button className="btn-secondary w-full" disabled={disabled} onClick={() => onSelect(true)}>
          {busy ? 'Optimizing...' : 'Optimize layout'}
        </button>
        <p className="text-xs text-gray-400 mt-2">Combine compatible opaque parts across placements. No API call or geometry simplification.</p>
      </> : result.available ? <>
        <div className="flex gap-2" role="group" aria-label="Compare layouts">
          <button className={result.enabled ? 'btn-secondary flex-1' : 'btn-helios flex-1'}
            disabled={disabled} aria-pressed={!result.enabled} onClick={() => onSelect(false)}>Original</button>
          <button className={result.enabled ? 'btn-helios flex-1' : 'btn-secondary flex-1'}
            disabled={disabled} aria-pressed={result.enabled} onClick={() => onSelect(true)}>Optimized</button>
        </div>
        <div className="text-sm mt-3" role="status" aria-label="Optimization result">
          Draw calls: <output aria-label="Original draw calls">{result.before.calls}</output>
          {' → '}<output aria-label="Optimized draw calls">{result.after.calls}</output>
          <p className="text-xs text-gray-400 mt-1">Rendered triangles: {result.before.triangles.toLocaleString()} → {result.after.triangles.toLocaleString()}</p>
          {result.after.calls >= result.before.calls && <p className="text-xs text-amber-400 mt-1">No draw-call reduction from this camera.</p>}
        </div>
        <p className="text-xs text-gray-400 mt-2">Measured at the optimization camera, including studio guides and transmission passes; excluding shadows. No triangles removed. Grouping reduces per-part editability and culling granularity.</p>
      </> : <p role="status" aria-label="Optimization result" className="text-sm text-gray-300">{result.report.reason || 'No compatible repeated parts to combine. Original layout retained.'}</p>}
    </section>
  )
}
