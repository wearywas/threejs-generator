import React, { useEffect, useRef, useState } from 'react'
import { builtinTemplates } from '../services/builtinTemplates'
import { generatedStarters, loadGeneratedStarter } from '../services/generatedStarters'

/** Shipped starting points, kept separate from the user's saved assets. */
export default function TemplateGallery({ onLoad }) {
  const [loadingId, setLoadingId] = useState(null)
  const [error, setError] = useState('')
  const loadingRef = useRef(false)
  const requestRef = useRef(0)

  // Closing the library or changing tabs abandons its pending selection.
  useEffect(() => () => { requestRef.current++ }, [])

  const handleLoadStarter = async starter => {
    if (loadingRef.current) return
    loadingRef.current = true
    const request = ++requestRef.current
    setLoadingId(starter.id)
    setError('')
    try {
      const document = await loadGeneratedStarter(starter.id)
      if (request !== requestRef.current) return
      await onLoad(document)
    } catch (err) {
      if (request === requestRef.current) setError(err.message || `Could not load ${starter.name} starter.`)
    } finally {
      if (request === requestRef.current) {
        loadingRef.current = false
        setLoadingId(null)
      }
    }
  }

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-neutral-100">Start from a generated example</h3>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">
          Explore AI-generated assets with ready-to-use controls. Load one, adjust its parameters, then save a copy.
        </p>
        <p className="mt-2 text-xs text-helios-300">No API key or credits needed.</p>
      </div>
      {loadingId && <p role="status" className="mb-4 text-xs text-helios-300">Loading starter...</p>}
      {error && <p role="alert" className="mb-4 text-sm text-red-300">{error} Try again.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {generatedStarters.map(starter => (
          <button
            key={starter.id}
            type="button"
            aria-label={`Load ${starter.name} starter`}
            aria-busy={loadingId === starter.id}
            disabled={loadingId !== null}
            onClick={() => handleLoadStarter(starter)}
            className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 text-left transition-colors hover:border-helios-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-helios-400 disabled:cursor-wait disabled:opacity-60"
          >
            <img src={starter.thumbnail} alt="" width="640" height="480" className="aspect-[4/3] w-full object-cover" />
            <span className="flex flex-1 flex-col p-4">
              <span className="font-semibold text-neutral-100">{starter.name}</span>
              <span className="mt-1 mb-4 text-xs leading-relaxed text-neutral-400">{starter.description}</span>
              <span className="mt-auto text-xs font-medium text-helios-300 group-hover:text-helios-200">
                {loadingId === starter.id ? 'Loading...' : 'Load starter'} <span aria-hidden="true">→</span>
              </span>
            </span>
          </button>
        ))}
      </div>
      <details className="mt-6 border-t border-neutral-700 pt-4">
        <summary className="cursor-pointer rounded text-sm font-medium text-neutral-300 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-helios-400">Built-in generators</summary>
        <p className="mt-2 mb-4 text-xs leading-relaxed text-neutral-400">Hand-built procedural templates with ready-to-use controls.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {builtinTemplates.map(template => (
            <button
              key={template.id}
              type="button"
              data-template-generator={template.document.spec.generator}
              aria-label={`Load ${template.name} template`}
              disabled={loadingId !== null}
              onClick={() => { if (!loadingRef.current) onLoad(template.document) }}
              className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 text-left transition-colors hover:border-helios-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-helios-400 disabled:cursor-wait disabled:opacity-60"
            >
              <img src={template.thumbnail} alt="" width="640" height="480" className="aspect-[4/3] w-full object-cover" />
              <span className="flex flex-1 flex-col p-4">
                <span className="font-semibold text-neutral-100">{template.name}</span>
                <span className="mt-1 mb-4 text-xs leading-relaxed text-neutral-400">{template.description}</span>
                <span className="mt-auto text-xs font-medium text-helios-300 group-hover:text-helios-200">Load template <span aria-hidden="true">→</span></span>
              </span>
            </button>
          ))}
        </div>
      </details>
    </div>
  )
}
