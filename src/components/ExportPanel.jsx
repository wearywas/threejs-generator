import React, { useState, useEffect } from 'react'
import { 
  exportAsGLB, 
  generateCodeSnippet,
  generateAddonImports,
  checkBatchingSupport,
  estimateBatchingSavings
} from '../runtime/exporter'
import BatchingPreviewPanel from './BatchingPreviewPanel'
import { exportAssetGLB } from './assetCapture'
import { serializeAssetSource } from '../services/assetSource'
import { assetFilenameStem } from '../services/assetFilename'

const EMPTY_INPUTS = Object.freeze({})

export default function ExportPanel({ assetDocument, asset, spec, code, prompt, params = EMPTY_INPUTS, seed = 12345, textures = EMPTY_INPUTS }) {
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const [batchExported, setBatchExported] = useState(false)
  const [batchingInfo, setBatchingInfo] = useState(null)
  const [estimatedSavings, setEstimatedSavings] = useState(null)
  const [showBatchingPreview, setShowBatchingPreview] = useState(false)

  // Check batching support when code changes
  useEffect(() => {
    let active = true
    setEstimatedSavings(null)
    setError(null)
    if (code) {
      const info = checkBatchingSupport(code)
      setBatchingInfo(info)
      
      // If valid, try to estimate savings
      if (asset?.isIsolated && info.valid && info.recommendation !== 'low') {
        async function analyze() {
          let release
          try {
            release = asset.retain?.()
            const instanceSpec = await asset.analyze({ name: prompt || 'Asset', prompt: prompt || '' })
            if (active) setEstimatedSavings(estimateBatchingSavings(instanceSpec, 100))
          } catch (error) {
            if (active) setError('Could not analyze batching: ' + error.message)
          } finally {
            release?.()
          }
        }
        analyze()
      } else {
        setEstimatedSavings(null)
      }
    } else {
      setBatchingInfo(null)
      setEstimatedSavings(null)
    }
    return () => { active = false }
  }, [asset, code, prompt])

  const handleExportGLB = async () => {
    if (!asset?.isIsolated && !asset?.root) return
    
    setExporting(true)
    setError(null)
    try {
      await exportAssetGLB(asset, assetFilenameStem(prompt, spec?.generator), { exportLocal: exportAsGLB })
    } catch (err) {
      setError('Failed to export GLB: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const handleExportCode = async () => {
    try {
      let codeSnippet
      
      if (code) {
        // Export only the committed document, never the editor's unapplied draft.
        const usedAddons = asset?.usedAddons || []
        codeSnippet = serializeAssetSource(assetDocument, generateAddonImports(usedAddons))
      } else if (spec) {
        // Curated mode - use spec-based snippet
        codeSnippet = generateCodeSnippet(spec)
      } else {
        return
      }
      
      const filename = `${assetFilenameStem(prompt, spec?.generator)}.js`
      
      // Create and download the file
      const blob = new Blob([codeSnippet], { type: 'text/javascript' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Failed to export code: ' + err.message)
    }
  }

  // Open the batching preview panel
  const handleOpenBatchingPreview = () => {
    if (!code) {
      alert('Batching export requires a generated-code asset')
      return
    }
    setShowBatchingPreview(true)
  }

  // Called when export completes from preview panel
  const handleBatchExportComplete = () => {
    setBatchExported(true)
    setTimeout(() => setBatchExported(false), 2000)
  }

  const isDisabled = !asset?.isIsolated && !asset?.root
  const canCopyCode = spec || code
  const canExportBatch = !!asset?.isIsolated && !!code && batchingInfo?.valid

  // Determine batching recommendation color
  const getBatchingColor = () => {
    if (!batchingInfo) return 'gray'
    if (batchingInfo.recommendation === 'high') return 'green'
    if (batchingInfo.recommendation === 'medium') return 'yellow'
    return 'gray'
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleExportGLB}
          disabled={isDisabled || exporting}
          className="btn-helios flex-1 text-sm"
        >
          {exporting ? 'Exporting...' : 'Download GLB'}
        </button>
        <button
          onClick={handleExportCode}
          disabled={!canCopyCode}
          className="btn-secondary flex-1 text-sm"
          title={code ? 'Download the last working source with saved inputs and a createSavedAsset helper.' : 'Download the template specification and runtime usage example.'}
        >
          {copied ? 'Saved!' : 'Download .js'}
        </button>
      </div>
      {code && (
        <p className="text-xs text-gray-400">
          Includes the last working source, seed, slider values, and texture inputs.
          Use createSavedAsset() to recreate it, or import the file through Library.
          Copy source/draft copies only the editor text.
        </p>
      )}
      
      {/* Addon usage notice */}
      {asset?.usedAddons?.length > 0 && (
        <div className="text-xs text-blue-400 bg-blue-900/30 px-3 py-2 rounded">
          Uses addons: {asset.usedAddons.join(', ')}
        </div>
      )}
      
      {asset?.hasAnimation && (
        <div className="text-xs text-amber-500 bg-amber-900/30 px-3 py-2 rounded">
          This asset has runtime animation. GLB export will be a static snapshot.
        </div>
      )}

      {code && (
        <details className="rounded border border-[var(--studio-border)] px-3 py-2 text-xs text-[var(--studio-muted)]">
          <summary className="cursor-pointer font-medium text-[var(--studio-text)]">Advanced: batching</summary>
          <div className="mt-3 space-y-2">
            {/* Batching preview button - opens preview panel to verify before export */}
            {canExportBatch && (
              <button
                onClick={handleOpenBatchingPreview}
                className="btn-secondary w-full"
              >
                {batchExported ? 'Exported!' : 'Prepare for Batching'}
              </button>
            )}

            {/* Batching info and estimated savings */}
            {batchingInfo && (
              <div className={`text-xs px-3 py-2 rounded ${
                batchingInfo.recommendation === 'high'
                  ? 'text-gray-400 bg-gray-800/30'
                  : batchingInfo.recommendation === 'medium'
                  ? 'text-yellow-400 bg-yellow-900/30'
                  : 'text-gray-400 bg-gray-800/30'
              }`}>
                <div className="font-medium mb-1">
                  {batchingInfo.recommendation === 'high' && 'Ready for repeated placement'}
                  {batchingInfo.recommendation === 'medium' && 'May benefit from batching'}
                  {batchingInfo.recommendation === 'low' && 'Simple asset — batching optional'}
                </div>
                <div className="opacity-80">{batchingInfo.reason}</div>
                {estimatedSavings && (
                  <div className="mt-1 pt-1 border-t border-current/20">
                    <span className="font-mono">
                      Spec estimate @ 100 placements: {estimatedSavings.unbatched} → {estimatedSavings.batched} draw calls
                    </span>
                    <p className="mt-1">Assumes a compatible batching renderer; not measured preview performance.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      )}
      
      {!asset && (
        <div className="text-xs text-gray-500">
          Generate an asset to enable export options
        </div>
      )}

      {/* Batching Preview Panel (modal) */}
      {showBatchingPreview && (
        <BatchingPreviewPanel
          code={code}
          asset={asset}
          prompt={prompt}
          params={params}
          seed={seed}
          textures={textures}
          onClose={() => setShowBatchingPreview(false)}
          onExport={() => {
            setShowBatchingPreview(false)
            handleBatchExportComplete()
          }}
        />
      )}
    </div>
  )
}
