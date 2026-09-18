import React, { useState, useRef, useSyncExternalStore } from 'react'
import PromptInput from './PromptInput'
import ProviderSettings, { RequestStatus } from './ProviderSettings'
import PreviewCanvas from './PreviewCanvas'
import SpecEditor from './SpecEditor'
import ParameterInspector from './ParameterInspector'
import DynamicParameterInspector from './DynamicParameterInspector'
import ExportPanel from './ExportPanel'
import CodeEditor from './CodeEditor'
import GenerationLibrary from './GenerationLibrary'
import SaveToLibraryModal from './SaveToLibraryModal'
import EditModal from './EditModal'
import ConversionModal from './ConversionModal'
import TextureSlots from './TextureSlots'
import CreativeTextureSlots from './CreativeTextureSlots'
import AssetStats from './AssetStats'
import WorkspaceWelcome from './WorkspaceWelcome'
import WorkspaceRecovery, { RecoveryStatus } from './WorkspaceRecovery'
import { useAssetWorkspace } from '../hooks/useAssetWorkspace'
import { useWorkspaceRecovery } from '../hooks/useWorkspaceRecovery'
import { saveGeneration } from '../services/generationLibrary'
import { createSeed } from '../services/assetDocument'
import { captureSaveSnapshot } from './assetCapture'
import { normalizeCreativeCode } from '../runtime/CodeSandbox'
import { llmClient } from '../api/llmClient'

const codexActionExplanation = 'Codex (experimental) supports Generate, Add editable controls, AI Edit, and Add Animation. Model requests use your Codex allowance. Local code editing, Re-run, sliders, and export do not make model requests.'

export default function App() {
  const modelSettings = useSyncExternalStore(llmClient.subscribe, llmClient.getSnapshot, llmClient.getSnapshot)
  const codexMode = modelSettings.provider === 'codex'
  const [uncapTriCount, setUncapTriCount] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [libraryTab, setLibraryTab] = useState('saved')
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editFailed, setEditFailed] = useState(false)
  const [showConversionModal, setShowConversionModal] = useState(false)
  const [conversionFailed, setConversionFailed] = useState(false)
  const [saveSnapshot, setSaveSnapshot] = useState(null)
  const [draft, setDraft] = useState(null)
  const previewCanvasRef = useRef(null)
  const { current, pending, parameterDraft, error, actions, cancel, getCurrent } = useAssetWorkspace({ uncapTriCount })
  const document = current?.document
  const asset = current?.asset || null
  const spec = document?.spec || null
  const assetMode = document?.mode || 'creative'
  const proceduralSchema = document?.schema || null
  const proceduralParams = document?.params || {}
  const inspectorParams = parameterDraft || proceduralParams
  const inspectorSpec = spec && parameterDraft ? { ...spec, params: parameterDraft } : spec
  const creativeTextureSlots = document?.textureSlots || []
  const originalPrompt = document?.prompt || ''
  const currentSeed = document?.seed
  const generatedCode = draft && draft.revision === current?.sourceRevision ? draft.code : document?.code || ''
  const hasDraft = generatedCode !== (document?.code || '')
  const recovery = useWorkspaceRecovery(document, hasDraft ? generatedCode : null)
  const busy = !!pending || !recovery.ready || !!recovery.candidate
  const parametersDisabled = busy && pending !== 'parameters'
  const loading = busy
  const converting = pending === 'convert'
  const addingAnimation = pending === 'animate'
  const editing = pending === 'edit'
  const parameterStatus = pending === 'parameters' && (
    <span role="status" aria-label="Parameter update status" className="flex items-center gap-2 whitespace-nowrap text-xs normal-case tracking-normal text-gray-400">
      Updating...
      <button type="button" onClick={cancel} aria-label="Cancel parameter updates" className="text-helios-300 underline">Cancel</button>
    </span>
  )

  const handleGenerate = prompt => actions.generate(prompt)
  const handleRestore = async () => {
    const saved = recovery.candidate
    if (!saved?.document) return
    if (await actions.load(saved.document)) {
      setDraft(saved.draftCode == null ? null : { revision: getCurrent().sourceRevision, code: saved.draftCode })
      recovery.controller.acceptRestored()
    }
  }
  const openLibrary = (tab = 'saved') => { setLibraryTab(tab); setShowLibrary(true) }
  const handleCodeChange = code => setDraft({ revision: current?.sourceRevision, code })
  const handleCodeRerun = code => actions.rerun(code)
  const handleParamsChange = params => actions.changeParams(params)
  const handleProceduralParamsChange = handleParamsChange
  // This callback closes over this exact document revision, including across FileReader waits.
  const handleTextureChange = (slot, dataUrl) => actions.changeTexture(slot, dataUrl, current)
  const handleCreativeTextureChange = handleTextureChange
  const handleOpenConversion = () => { setConversionFailed(false); setShowConversionModal(true) }
  const handleConvertToProcedural = async guidance => {
    setConversionFailed(false)
    if (await actions.convert(guidance)) setShowConversionModal(false)
    else setConversionFailed(true)
  }
  const handleAddAnimation = () => actions.animate()
  const handleOpenEdit = () => { setEditFailed(false); setShowEditModal(true) }
  const handleEdit = async prompt => {
    setEditFailed(false)
    if (await actions.edit(prompt)) setShowEditModal(false)
    else setEditFailed(true)
  }
  const handleLoadFromLibrary = async record => {
    cancel()
    setShowLibrary(false)
    await actions.load(record)
  }
  const handleImportCode = async (text, filename) => {
    if (!normalizeCreativeCode(text)) return false
    cancel()
    // Keep cancellation and the last-good preview accessible during execution.
    setShowLibrary(false)
    await actions.importCode(text, filename)
    // A recognized but invalid import reports the workspace error without losing the old preview.
    return true
  }
  const handleOpenSaveModal = async () => {
    if (!current) return
    const request = { document: current.document, thumbnail: null, isCapturing: true }
    setSaveSnapshot(request)
    const snapshot = await captureSaveSnapshot(current, previewCanvasRef.current)
    // Closing/reopening the modal must not restore an older pending capture.
    setSaveSnapshot(previous => previous === request ? snapshot : previous)
  }
  const handleSaveToLibrary = async ({ name, customTags }) => {
    if (!saveSnapshot) return
    await saveGeneration({ ...saveSnapshot.document, name, customTags, thumbnail: saveSnapshot.thumbnail })
    setSaveSnapshot(null)
  }

  return (
    <div className="studio-workbench">
      {/* Header */}
      <header className="studio-header">
        <div className="studio-header-row">
          <div className="studio-brand">
            <div className="brand-mark">
              <span className="text-gray-900 font-bold text-lg">3D</span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="text-helios-400">ThreeJS</span>
              <span className="text-white ml-2">Generator</span>
            </h1>
          </div>
          
          {/* Settings and asset library */}
          <div className="studio-header-actions">
            <fieldset disabled={busy} className="contents">
            <ProviderSettings disabled={busy} open={showModelSettings} onOpen={() => setShowModelSettings(true)} onClose={() => setShowModelSettings(false)} />
            {/* Library Button */}
            <button
              onClick={() => openLibrary()}
              className="btn-secondary library-trigger"
            >
              Library
            </button>
            </fieldset>
          </div>
        </div>
        
      </header>

      {/* Prompt Input */}
      <section className="prompt-workspace" aria-label="Create an asset">
        <PromptInput onGenerate={handleGenerate} loading={!!pending && pending !== 'parameters'} disabled={busy}>
        
        {/* Generation Options */}
        <div className="generation-options">
          <button type="button" disabled={busy} onClick={() => openLibrary('templates')} className="text-xs text-helios-300 underline underline-offset-4 hover:text-helios-200">Browse templates</button>
          <span className="mode-hint">Text to editable Three.js</span>
          <label className="flex items-center gap-2 cursor-pointer" title="Allow assets above the default triangle budget">
            <input
              type="checkbox"
              checked={uncapTriCount}
              onChange={(e) => setUncapTriCount(e.target.checked)}
              disabled={!!pending || !recovery.ready}
            />
            Uncap Tri Count
          </label>
        </div>
        </PromptInput>
        <RequestStatus disabled={!!pending && pending !== 'parameters'} onCancelRequest={cancel} onOpenSettings={() => setShowModelSettings(true)} />
        
        {error && !showEditModal && !showConversionModal && (
          <div role="alert" className="mt-3 px-4 py-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}
      </section>

      <WorkspaceRecovery recovery={recovery} restoring={pending === 'load'} onRestore={handleRestore} onCancel={cancel} />

      {/* Main Content */}
      <main className="studio-main">
        {/* Preview Canvas */}
        <section className="preview-workspace" aria-label="3D workspace">
          <div className="viewport-toolbar"><span title={originalPrompt}>{originalPrompt}</span><span>Drag to orbit · Scroll to zoom</span></div>
          <div className="viewport-canvas">
          {asset ? <PreviewCanvas ref={previewCanvasRef} asset={asset} continuityKey={current?.sourceRevision} /> :
            <WorkspaceWelcome onBrowseTemplates={() => openLibrary('templates')} onConnectModel={() => setShowModelSettings(true)} disabled={busy} codexAvailable={modelSettings.codexAvailable} />}
          </div>
        </section>

        {/* Right Panel - scrollable container */}
        <aside className="asset-inspector custom-scrollbar" aria-label="Asset inspector">
          {codexMode && <p id="codex-action-support" className="px-4 py-2 text-xs text-gray-400">{codexActionExplanation}</p>}
          {document && <RecoveryStatus status={recovery.status} />}
          {hasDraft && (
            <p className="px-4 py-2 text-xs text-amber-300" role="status">
              Code draft not applied. Re-run to update the preview. Save, AI edits, and exports use the last working version.
            </p>
          )}
          <fieldset disabled={parametersDisabled} className="contents">
          {assetMode === 'curated' ? (
              <div className="flex-shrink-0 border-b border-gray-800">
                <div className="panel-header flex items-center justify-between gap-2"><span>Parameters</span>{parameterStatus}</div>
                <div className="p-4 max-h-48 overflow-y-auto">
                  <ParameterInspector 
                    spec={inspectorSpec}
                    onParamsChange={handleParamsChange} 
                  />
                </div>
              </div>
          ) : assetMode === 'procedural' ? (
              <div className="flex-shrink-0 border-b border-gray-800">
                <div className="panel-header flex items-center justify-between gap-2"><span>Procedural Parameters</span>{parameterStatus}</div>
                <div className="p-4 max-h-64 overflow-y-auto">
                  <DynamicParameterInspector
                    schema={proceduralSchema}
                    params={inspectorParams}
                    onParamsChange={handleProceduralParamsChange}
                  />
                </div>
              </div>
          ) : null}
          </fieldset>
          <fieldset disabled={busy} className="contents">
          {assetMode === 'curated' ? (
            <>

              {/* Texture Slots */}
              {spec && (
                <div className="flex-shrink-0 border-b border-gray-800">
                  <div className="panel-header">Textures</div>
                  <div className="p-4 max-h-32 overflow-y-auto">
                    <TextureSlots 
                      key={current?.revision}
                      generator={spec.generator}
                      textures={document?.textures}
                      onTextureChange={handleTextureChange}
                    />
                  </div>
                </div>
              )}

              {/* Spec Editor */}
              <div className="flex-shrink-0 flex flex-col border-b border-gray-800" style={{ minHeight: '200px', maxHeight: '300px' }}>
                <div className="panel-header">Template settings</div>
                <div className="flex-1 overflow-y-auto">
                  <SpecEditor spec={spec} />
                </div>
              </div>
            </>
          ) : assetMode === 'procedural' ? (
            <>
              {/* Creative Texture Slots (if any defined by edit) */}
              {creativeTextureSlots.length > 0 && (
                <div className="flex-shrink-0 border-b border-gray-800">
                  <div className="panel-header">Textures</div>
                  <div className="p-4 max-h-32 overflow-y-auto">
                    <CreativeTextureSlots 
                      key={current?.revision}
                      textures={document?.textures}
                      slots={creativeTextureSlots}
                      onTextureChange={handleCreativeTextureChange}
                    />
                  </div>
                </div>
              )}

              {/* Code Editor */}
              <div className="flex-shrink-0 flex flex-col border-b border-gray-800" style={{ minHeight: '200px', height: '250px' }}>
                <div className="panel-header flex items-center justify-between">
                  <span>Generated Code</span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleOpenEdit}
                      disabled={loading || editing}
                      className="btn-tool"
                      title={codexMode ? codexActionExplanation : 'Edit with AI'}
                      aria-describedby={codexMode ? 'codex-action-support' : undefined}
                    >
                      AI Edit
                    </button>
                    <button
                      onClick={handleAddAnimation}
                      disabled={addingAnimation || loading}
                      className="btn-tool"
                      title={codexMode ? codexActionExplanation : 'Add or enhance animation with AI'}
                      aria-describedby={codexMode ? 'codex-action-support' : undefined}
                    >
                      {addingAnimation ? 'Adding...' : 'Add Animation'}
                    </button>
                    <button
                      onClick={() => handleCodeRerun(generatedCode)}
                      className="btn-tool"
                      disabled={loading}
                    >
                      Re-run
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CodeEditor 
                    key={current?.sourceRevision}
                    code={generatedCode}
                    appliedCode={document?.code}
                    onChange={handleCodeChange}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Creative Texture Slots (if any defined by edit) */}
              {creativeTextureSlots.length > 0 && (
                <div className="flex-shrink-0 border-b border-gray-800">
                  <div className="panel-header">Textures</div>
                  <div className="p-4 max-h-32 overflow-y-auto">
                    <CreativeTextureSlots 
                      key={current?.revision}
                      textures={document?.textures}
                      slots={creativeTextureSlots}
                      onTextureChange={handleCreativeTextureChange}
                    />
                  </div>
                </div>
              )}

              {/* Code Editor for Creative Mode */}
              <div className="flex-shrink-0 flex flex-col border-b border-gray-800" style={{ minHeight: '200px', height: '250px' }}>
                <div className="panel-header flex items-center justify-between">
                  <span>Generated Code</span>
                  <div className="flex gap-2">
                    {generatedCode && (
                      <>
                        <button
                          onClick={handleOpenEdit}
                          disabled={loading || editing}
                          className="btn-tool"
                          title={codexMode ? codexActionExplanation : 'Edit with AI'}
                          aria-describedby={codexMode ? 'codex-action-support' : undefined}
                        >
                          AI Edit
                        </button>
                        <button
                          onClick={() => handleCodeRerun(generatedCode)}
                          className="btn-tool"
                          disabled={loading}
                        >
                          Re-run
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CodeEditor 
                    key={current?.sourceRevision}
                    code={generatedCode}
                    appliedCode={document?.code}
                    onChange={handleCodeChange}
                  />
                </div>
              </div>

              {/* Convert to Procedural Button */}
              {generatedCode && (
                <div className="flex-shrink-0 p-4 border-b border-gray-800">
                  <button
                    onClick={handleOpenConversion}
                    disabled={converting || loading}
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    {converting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Converting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Add editable controls
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-xs text-gray-500 text-center">
                    Add parameter sliders for easy customization
                  </p>
                </div>
              )}
            </>
          )}

          {/* Asset Stats Panel */}
          <div className="flex-shrink-0 border-b border-gray-800">
            <div className="panel-header">Asset Info</div>
            <div className="p-4">
              <AssetStats asset={asset} spec={spec} mode={assetMode} />
              {document && (
                <div className="mt-3 text-xs text-gray-400 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Seed: <output aria-label="Asset seed">{currentSeed}</output></span>
                    <button onClick={() => actions.changeSeed(createSeed())} className="text-helios-300 underline">New variation</button>
                  </div>
                  {document.restorationNotes.map(note => <p key={note} className="text-amber-300">{note}</p>)}
                </div>
              )}
            </div>
          </div>

          {/* Export Panel */}
          <div className="flex-shrink-0">
            <div className="panel-header">Export</div>
            <div className="p-4 space-y-3">
              <ExportPanel 
                assetDocument={document}
                asset={asset} 
                spec={spec} 
                code={document?.code}
                prompt={originalPrompt}
                params={proceduralParams}
                seed={currentSeed}
                textures={document?.textures}
              />
              
              {/* Save to Library Button */}
              {asset && (
                <button
                  onClick={handleOpenSaveModal}
                  className="btn-secondary w-full flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Save to Library
                </button>
              )}
            </div>
          </div>
          </fieldset>
        </aside>
      </main>

      {/* Library Modal */}
      {showLibrary && (
        <GenerationLibrary
          initialTab={libraryTab}
          onClose={() => setShowLibrary(false)}
          onLoad={handleLoadFromLibrary}
          onImportCode={handleImportCode}
        />
      )}

      {/* Save to Library Modal */}
      <SaveToLibraryModal
        isOpen={!!saveSnapshot}
        onClose={() => setSaveSnapshot(null)}
        onSave={handleSaveToLibrary}
        thumbnail={saveSnapshot?.thumbnail}
        defaultName={saveSnapshot?.document.prompt || ''}
        isCapturing={!!saveSnapshot?.isCapturing}
      />

      {/* Conversion guidance */}
      <ConversionModal
        isOpen={showConversionModal}
        onClose={() => setShowConversionModal(false)}
        onConvert={handleConvertToProcedural}
        onCancelRequest={() => { cancel(); setShowConversionModal(false) }}
        loading={converting}
        error={conversionFailed ? error : null}
        onOpenSettings={() => { setShowConversionModal(false); setShowModelSettings(true) }}
        currentPrompt={originalPrompt}
      />

      {/* Generative Edit Modal */}
      <EditModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onEdit={handleEdit}
        onCancelRequest={() => {
          cancel()
          setShowEditModal(false)
        }}
        loading={editing}
        error={editFailed ? error : null}
        onOpenSettings={() => { setShowEditModal(false); setShowModelSettings(true) }}
        currentPrompt={originalPrompt}
      />

    </div>
  )
}
