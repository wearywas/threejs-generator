import React, { useRef, useEffect, useState } from 'react'
import { downloadGLB, exportAsBatchableAsset } from '../runtime/exporter'
import IsolatedPreviewCanvas from './IsolatedPreviewCanvas'
import Modal from './Modal'
import { getBatchPreviewSpacing } from './batchPreviewDefaults'
import { assetFilenameStem } from '../services/assetFilename'
import BatchOptimizationControls from './BatchOptimizationControls'

/**
 * BatchingPreviewPanel
 * 
 * Shows a preview of how the asset will look when batched with multiple placements.
 * Allows user to verify the batching looks correct before exporting.
 * 
 * For DISTRIBUTED assets: Shows multiple clumps with scattered instances
 * For HIERARCHICAL assets: Shows multiple complete units at different positions
 */
export default function BatchingPreviewPanel({ 
  code, 
  asset, 
  prompt,
  params = {},      // Current procedural params from sliders
  seed = 12345,     // Current seed used to generate the asset
  textures = {},
  onClose,
  onExport
}) {
  const lifecycleRef = useRef(null)
  const previewRef = useRef(null)
  const exportTimerRef = useRef(null)
  const [analysis, setAnalysis] = useState(null)
  const [isGenerating, setIsGenerating] = useState(true)
  const [error, setError] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [readyPreview, setReadyPreview] = useState(null)
  const [glbStatus, setGlbStatus] = useState('')
  const [optimization, setOptimization] = useState(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [previewParams, setPreviewParams] = useState(() => ({
    gridSize: 3,
    spacing: getBatchPreviewSpacing(asset),
    rotationJitter: 0.3,
    scaleJitter: 0.2,
  }))
  const instanceSpec = analysis?.asset === asset ? analysis.spec : null
  const structureType = instanceSpec?.structureType
  const previewReady = readyPreview?.asset === asset && readyPreview.key === JSON.stringify(previewParams)
  const optimized = previewReady && optimization?.enabled === true
  const busy = !!isExporting || isOptimizing

  useEffect(() => {
    const token = {}
    lifecycleRef.current = token
    setIsExporting(false)
    setExportSuccess(false)
    setGlbStatus('')
    setOptimization(null)
    setIsOptimizing(false)
    setIsGenerating(true)
    setError(null)
    setAnalysis(null)
    async function analyzeAsset() {
      let release
      try {
        if (!code || !asset?.isIsolated) throw new Error('No isolated asset to analyze')
        release = asset.retain?.()
        const spec = await asset.analyze({ name: prompt || 'Batched Asset', prompt: prompt || '' })
        if (lifecycleRef.current === token) setAnalysis({ asset, spec })
      } catch (error) {
        if (lifecycleRef.current === token) setError(error.message)
      } finally {
        release?.()
        if (lifecycleRef.current === token) setIsGenerating(false)
      }
    }
    analyzeAsset()
    return () => {
      lifecycleRef.current = null
      clearTimeout(exportTimerRef.current)
    }
  }, [code, asset, prompt])

  // Handle export
  const handleExport = async () => {
    if (!code || !instanceSpec || busy) return

    setIsExporting('js')
    setError(null)
    const token = lifecycleRef.current
    let release
    try {
      release = asset.retain?.()
      const filename = assetFilenameStem(prompt)

      const result = await exportAsBatchableAsset(code, {
        name: prompt || 'Generated Asset',
        prompt: prompt || '',
        seed: seed,
        params: params,
        textures,
        instanceSpec,
      }, filename)

      if (lifecycleRef.current !== token) return
      if (result.success) {
        setExportSuccess(true)
        exportTimerRef.current = setTimeout(() => {
          if (lifecycleRef.current !== token) return
          setExportSuccess(false)
          if (onExport) onExport()
        }, 1500)
      } else {
        throw new Error(result.error)
      }
    } catch (err) {
      if (lifecycleRef.current === token) setError('Export failed: ' + err.message)
    } finally {
      release?.()
      if (lifecycleRef.current === token) setIsExporting(false)
    }
  }

  const handleExportGLB = async () => {
    if (!previewReady || busy) return
    clearTimeout(exportTimerRef.current)
    const token = lifecycleRef.current
    const release = asset.retain?.()
    setIsExporting('glb')
    setGlbStatus('')
    setError(null)
    try {
      const bytes = await previewRef.current.exportGLB()
      if (lifecycleRef.current !== token) return
      downloadGLB(bytes, `${assetFilenameStem(prompt)}${optimized ? '.optimized' : ''}.layout`)
      setGlbStatus(`${optimized ? 'Optimized' : 'Preview'} GLB downloaded.`)
    } catch (error) {
      if (lifecycleRef.current === token) setError('GLB export failed: ' + error.message)
    } finally {
      release?.()
      if (lifecycleRef.current === token) setIsExporting(false)
    }
  }

  const handleOptimization = async enabled => {
    if (!previewReady || busy) return
    clearTimeout(exportTimerRef.current)
    const token = lifecycleRef.current
    const release = asset.retain?.()
    setIsOptimizing(true)
    setError(null)
    setGlbStatus('')
    try {
      const result = await previewRef.current.setOptimization(enabled)
      if (lifecycleRef.current === token) setOptimization(result)
    } catch (error) {
      if (lifecycleRef.current === token) { setOptimization(null); setError('Optimization failed: ' + error.message) }
    } finally {
      release?.()
      if (lifecycleRef.current === token) setIsOptimizing(false)
    }
  }

  // Parameter controls
  const handleParamChange = (key, value) => {
    setGlbStatus('')
    setOptimization(null)
    setPreviewParams(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Modal onClose={onClose} labelledBy="batch-preview-title" className="batch-dialog w-[90vw] h-[85vh] max-w-6xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-4">
            <h2 id="batch-preview-title" className="text-xl font-semibold text-white">Batching Preview</h2>
            {structureType && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                structureType === 'distributed' 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {structureType === 'distributed' ? 'Distributed' : 'Assembled asset'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close batching preview"
            className="text-gray-400 hover:text-white transition-colors text-2xl"
          >
            ×
          </button>
        </div>

        {/* Main content */}
        <div className="batch-dialog-body">
          {/* Preview viewport */}
          <div className="batch-dialog-viewport">
            {asset?.isIsolated && <IsolatedPreviewCanvas ref={previewRef} asset={asset} batch={previewParams}
              onReady={key => setReadyPreview(key === null ? null : { asset, key })} />}
            
            {isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-white flex items-center gap-3">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing asset structure...
                </div>
              </div>
            )}

          </div>

          {/* Controls sidebar */}
          <div className="batch-dialog-controls">
            {/* Structure info */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Structure Analysis
              </h3>
              {structureType === 'distributed' ? (
                <div className="text-sm text-gray-300 bg-emerald-900/20 border border-emerald-700/30 rounded-lg p-3">
                  <p className="font-medium text-emerald-400 mb-2">Distributed Asset</p>
                  <p className="text-gray-400">
                    Scattered elements, such as grass. Each preview placement preserves the generated clump.
                  </p>
                </div>
              ) : (
                <div className="text-sm text-gray-300 bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
                  <p className="font-medium text-amber-400 mb-2">Hierarchical Asset</p>
                  <p className="text-gray-400">
                    A single assembled unit. Its parts stay together in each placement.
                  </p>
                </div>
              )}
            </div>

            {/* Preview parameters */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Preview Settings
              </h3>
              
              <fieldset disabled={busy} className="space-y-4">
                <div>
                  <label htmlFor="batch-gridSize" className="text-sm text-gray-300 block mb-1">
                    Grid Size: {previewParams.gridSize}×{previewParams.gridSize}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    id="batch-gridSize"
                    value={previewParams.gridSize}
                    onChange={(e) => handleParamChange('gridSize', parseInt(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                </div>

                <div>
                  <label htmlFor="batch-spacing" className="text-sm text-gray-300 block mb-1">
                    Spacing: {previewParams.spacing.toFixed(1)}m
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="0.1"
                    id="batch-spacing"
                    value={previewParams.spacing}
                    onChange={(e) => handleParamChange('spacing', parseFloat(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                </div>

                <div>
                  <label htmlFor="batch-rotationJitter" className="text-sm text-gray-300 block mb-1">
                    Rotation Jitter: {Math.round(previewParams.rotationJitter * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    id="batch-rotationJitter"
                    value={previewParams.rotationJitter}
                    onChange={(e) => handleParamChange('rotationJitter', parseFloat(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                </div>

                <div>
                  <label htmlFor="batch-scaleJitter" className="text-sm text-gray-300 block mb-1">
                    Scale Jitter: {Math.round(previewParams.scaleJitter * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.05"
                    id="batch-scaleJitter"
                    value={previewParams.scaleJitter}
                    onChange={(e) => handleParamChange('scaleJitter', parseFloat(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                </div>
              </fieldset>
            </div>

            <BatchOptimizationControls result={optimization} disabled={busy || !previewReady}
              busy={isOptimizing} onSelect={handleOptimization} />

            {/* Spec info */}
            {instanceSpec && (
              <details className="mb-4 text-gray-400">
                <summary className="cursor-pointer text-sm font-semibold">Batching analysis ({instanceSpec.meshes?.length || 0} groups)</summary>
                <div className="text-xs space-y-1 bg-gray-900/50 rounded-lg p-3 mt-2 font-mono">
                  <p>Spec mesh groups: {instanceSpec.meshes?.length || 0}</p>
                  <p>Instances/Clump: {instanceSpec.performance?.instancesPerClump || 'N/A'}</p>
                  <p>Animation: {instanceSpec.animation?.type || 'none'}</p>
                  <p>Structure: {instanceSpec.structureType || 'hierarchical'}</p>
                  {/* Show material groups if meshes were merged */}
                  {instanceSpec.meshes?.some(m => m.mergedFrom?.length > 1) && (
                    <p className="text-emerald-400 mt-2">
                      Repeated geometry/material groups detected.
                    </p>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Original specification analysis, not measured draw calls. Automatic layout optimization is separate from this specification.
                </p>
              </details>
            )}

            {/* Export button */}
            <div className="mt-auto pt-4 border-t border-gray-700">
              <button
                onClick={handleExportGLB}
                disabled={busy || !previewReady}
                className="btn-helios w-full"
              >
                {isExporting === 'glb' ? 'Exporting GLB...' : optimized ? 'Download optimized GLB' : 'Download preview GLB'}
              </button>
              <p className="text-xs text-gray-400 mt-2 mb-4">
                Full displayed {optimized ? 'optimized ' : ''}layout with instancing. Use 1×1 for one asset. No studio lights or guides.
                {asset?.hasAnimation && ' Runtime animation is exported as a static snapshot.'}
              </p>
              <button
                onClick={handleExport}
                disabled={busy || !instanceSpec}
                className="btn-secondary w-full"
              >
                {exportSuccess ? 'Exported!' : isExporting === 'js' ? 'Exporting JS...' : 'Download batchable JS'}
              </button>
              
              <p className="text-xs text-gray-500 mt-3 text-center">
                Original .batchable.js specification and source for a compatible renderer. Does not include the displayed layout or automatic optimization.
              </p>
              {glbStatus && <p role="status" className="text-xs text-emerald-400 mt-3">{glbStatus}</p>}
              {error && <p role="alert" className="text-sm text-red-400 mt-3">{error}</p>}
            </div>
          </div>
        </div>
    </Modal>
  )
}
