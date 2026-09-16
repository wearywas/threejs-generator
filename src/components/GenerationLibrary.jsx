import React, { useState, useEffect, useCallback, useRef } from 'react'
import Modal from './Modal'
import TemplateGallery from './TemplateGallery'
import { 
  getAllGenerations, 
  deleteGeneration, 
  updateGeneration,
  exportLibrary,
  importLibrary,
  getLibraryStats
} from '../services/generationLibrary'

/**
 * Generation Library Modal - Browse, filter, and load saved generations
 */
export default function GenerationLibrary({ onClose, onLoad, onImportCode, initialTab = 'saved' }) {
  const [activeTab, setActiveTab] = useState(initialTab === 'templates' ? 'templates' : 'saved')
  const tabRefs = useRef({})
  const [generations, setGenerations] = useState([])
  const [stats, setStats] = useState(null)
  const [filter, setFilter] = useState({ mode: 'all', starred: false, search: '' })
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  
  // Load generations
  const loadGenerations = useCallback(async () => {
    setLoading(true)
    try {
      const options = {}
      if (filter.mode !== 'all') {
        options.mode = filter.mode
      }
      if (filter.starred) {
        options.starred = true
      }
      
      let results = await getAllGenerations(options)
      
      // Apply search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase()
        results = results.filter(gen => 
          (gen.name && gen.name.toLowerCase().includes(searchLower)) ||
          gen.prompt.toLowerCase().includes(searchLower) ||
          gen.tags.some(tag => tag.includes(searchLower))
        )
      }
      
      setGenerations(results)
      
      // Load stats
      const libraryStats = await getLibraryStats()
      setStats(libraryStats)
    } catch (err) {
      console.error('Failed to load generations:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])
  
  useEffect(() => {
    loadGenerations()
  }, [loadGenerations])
  
  const handleDelete = async (id) => {
    if (!confirm('Delete this generation?')) return
    
    try {
      await deleteGeneration(id)
      loadGenerations()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }
  
  const handleToggleStar = async (id, currentStarred) => {
    try {
      await updateGeneration(id, { starred: !currentStarred })
      loadGenerations()
    } catch (err) {
      console.error('Failed to toggle star:', err)
    }
  }
  
  const handleExport = async () => {
    try {
      const data = await exportLibrary()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `threejs-library-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export:', err)
      alert('Failed to export library')
    }
  }
  
  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    setImporting(true)
    try {
      const text = await file.text()
      const trimmed = text.trim()

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        // Library backup (JSON export of records)
        const data = JSON.parse(text)
        const result = await importLibrary(data)
        alert(`Imported ${result.imported} generations (${result.skipped} skipped)`)
        loadGenerations()
      } else if (onImportCode && await onImportCode(text, file.name)) {
        // Source file or versioned Download .js preset: loaded into the viewport;
        // the user can Save to Library from there.
      } else {
        alert('Unrecognized file: expected a library JSON export or a createAsset code file')
      }
    } catch (err) {
      console.error('Failed to import:', err)
      alert('Failed to import: ' + err.message)
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }
  
  const handleLoad = (generation) => {
    onLoad(generation)
  }

  const handleTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextTab = event.key === 'Home' ? 'saved'
      : event.key === 'End' ? 'templates'
        : activeTab === 'saved' ? 'templates' : 'saved'
    setActiveTab(nextTab)
    tabRefs.current[nextTab]?.focus()
  }
  
  return (
    <Modal labelledBy="generation-library-heading" onClose={onClose} className="w-full max-w-5xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 p-4 border-b border-neutral-700">
          <div className="min-w-0">
            <h2 id="generation-library-heading" className="text-base font-semibold text-neutral-100">Generation Library</h2>
            {stats && (
              <p className="text-xs leading-relaxed text-neutral-400 mt-1">
                {stats.total} saved {stats.total === 1 ? 'asset' : 'assets'}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close library"
            onClick={onClose}
            className="shrink-0 rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div role="tablist" aria-label="Library sections" className="flex shrink-0 gap-1 border-b border-neutral-700 px-4 pt-2">
          {[['saved', 'Saved assets'], ['templates', 'Templates']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`library-${id}-tab`}
              aria-controls={`library-${id}-panel`}
              aria-selected={activeTab === id}
              tabIndex={activeTab === id ? 0 : -1}
              ref={element => { tabRefs.current[id] = element }}
              onClick={() => setActiveTab(id)}
              onKeyDown={handleTabKeyDown}
              className={`border-b-2 px-4 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-helios-400 ${activeTab === id ? 'border-helios-400 text-helios-300' : 'border-transparent text-neutral-400 hover:text-neutral-100'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'templates' ? (
          <div role="tabpanel" id="library-templates-panel" aria-labelledby="library-templates-tab" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto">
            <TemplateGallery onLoad={handleLoad} />
          </div>
        ) : (
        <div role="tabpanel" id="library-saved-panel" aria-labelledby="library-saved-tab" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-neutral-700 flex shrink-0 flex-wrap gap-2">
          {/* Search */}
          <div className="w-full min-w-0 sm:w-auto sm:flex-1 sm:basis-48">
            <input
              type="search"
              aria-label="Search library"
              placeholder="Search prompts and tags..."
              value={filter.search}
              onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
              className="w-full min-w-0 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-md text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          
          {/* Mode filter */}
          <select
            aria-label="Filter by type"
            value={filter.mode}
            onChange={(e) => setFilter(prev => ({ ...prev, mode: e.target.value }))}
            className="min-w-0 max-w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">All assets</option>
            <option value="curated">Template copies</option>
            <option value="creative">Generated code</option>
            <option value="procedural">Editable controls</option>
          </select>
          
          {/* Starred filter */}
          <button
            type="button"
            aria-label="Starred only"
            aria-pressed={filter.starred}
            onClick={() => setFilter(prev => ({ ...prev, starred: !prev.starred }))}
            className={`px-3 py-2 rounded-md border text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
              filter.starred
                ? 'bg-amber-400 border-amber-400 text-neutral-950'
                : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100'
            }`}
          >
            Starred
          </button>
          
          {/* Import/Export */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="px-3 py-2 border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              Export
            </button>
            <label className="relative px-3 py-2 border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-sm cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-amber-400">
              {importing ? 'Importing...' : 'Import'}
              <input
                type="file"
                accept=".json,.js,.txt"
                onChange={handleImport}
                className="sr-only"
                disabled={importing}
              />
            </label>
          </div>
        </div>
        
        {/* Content */}
        <div className="min-h-32 flex-1 overflow-y-auto p-4" aria-busy={loading}>
          {loading ? (
            <div role="status" className="flex items-center justify-center h-32">
              <span className="sr-only">Loading library</span>
              <div aria-hidden="true" className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
            </div>
          ) : generations.length === 0 ? (
            <div className="text-center py-8 text-neutral-400">
              <p className="text-lg mb-2">No generations found</p>
              <p className="text-sm">
                {filter.search || filter.starred || filter.mode !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Save an asset or import a library to get started.'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {generations.map(gen => (
                <GenerationCard
                  key={gen.id}
                  generation={gen}
                  onLoad={() => handleLoad(gen)}
                  onDelete={() => handleDelete(gen.id)}
                  onToggleStar={() => handleToggleStar(gen.id, gen.starred)}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Footer with tags */}
        {stats?.topTags?.length > 0 && (
          <div className="p-4 shrink-0 border-t border-neutral-700">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-neutral-400">Popular tags:</span>
              {stats.topTags.slice(0, 8).map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => setFilter(prev => ({ ...prev, search: tag }))}
                  className="max-w-full break-all px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  {tag} ({count})
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
        )}
    </Modal>
  )
}

/**
 * Individual generation card
 */
function GenerationCard({ generation, onLoad, onDelete, onToggleStar }) {
  const formattedDate = new Date(generation.createdAt).toLocaleDateString()
  const assetName = generation.name || generation.prompt || 'asset'
  
  return (
    <div className="min-w-0 border border-neutral-700 bg-neutral-800 rounded-lg overflow-hidden group">
      {/* Thumbnail */}
      <div className="aspect-square bg-neutral-950 relative">
        <button
          type="button"
          aria-label={`Load ${assetName}`}
          onClick={onLoad}
          className="relative block w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
        >
        {generation.thumbnail ? (
          <img 
            src={generation.thumbnail} 
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-neutral-500">
            <svg aria-hidden="true" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </span>
        )}
        
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-4 py-2 bg-amber-400 text-neutral-950 rounded-md font-medium text-sm">
            Load
          </span>
        </span>
        </button>
        
        {/* Mode badge */}
        <div className="pointer-events-none absolute top-2 left-2 max-w-[calc(100%-3.5rem)] truncate px-2 py-0.5 bg-neutral-900/90 border border-neutral-700 text-neutral-300 rounded text-xs font-medium">
          {{ curated: 'Template', creative: 'Generated code', procedural: 'Editable controls' }[generation.mode] || 'Asset'}
        </div>
        
        {/* Star button */}
        <button
          type="button"
          aria-label={`${generation.starred ? 'Unstar' : 'Star'} ${assetName}`}
          aria-pressed={generation.starred}
          onClick={onToggleStar}
          className={`absolute top-2 right-2 p-1.5 rounded bg-neutral-900/90 transition-colors group-focus-within:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
            generation.starred
              ? 'text-amber-400'
              : 'text-neutral-300 sm:opacity-0 group-hover:opacity-100 hover:text-amber-400'
          }`}
        >
          <svg aria-hidden="true" className="w-5 h-5" fill={generation.starred ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      </div>
      
      {/* Info */}
      <div className="p-3">
        <p className="text-sm text-neutral-100 font-medium truncate mb-1" title={generation.name || generation.prompt}>
          {generation.name || 'Untitled'}
        </p>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">{formattedDate}</span>
          
          <button
            type="button"
            aria-label={`Delete ${assetName}`}
            onClick={onDelete}
            className="p-1.5 rounded text-neutral-400 hover:text-red-300 transition-colors sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            title="Delete"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        
        {/* Tags */}
        {generation.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {generation.tags.slice(0, 3).map(tag => (
              <span key={tag} className="max-w-full break-all px-1.5 py-0.5 bg-neutral-700 text-neutral-200 rounded text-xs">
                {tag}
              </span>
            ))}
            {generation.tags.length > 3 && (
              <span className="text-xs text-neutral-400">+{generation.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
