import React, { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import GenerationProgress from './GenerationProgress'

export default function ConversionModal({ isOpen, onClose, onConvert, onCancelRequest, loading, currentPrompt, error = '', onOpenSettings }) {
  const [guidance, setGuidance] = useState('')
  const inputRef = useRef(null)
  const handleClose = loading ? onCancelRequest : onClose

  useEffect(() => {
    if (isOpen) {
      setGuidance('')
    }
  }, [isOpen])

  const handleSubmit = event => {
    event.preventDefault()
    if (!loading) onConvert(guidance.trim())
  }

  if (!isOpen) return null

  return (
    <Modal labelledBy="conversion-heading" initialFocusRef={inputRef} onClose={handleClose} className="w-[calc(100vw-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100">
      <div className="flex shrink-0 items-start justify-between gap-3 p-4 border-b border-neutral-700">
        <div className="min-w-0">
          <h2 id="conversion-heading" className="text-base font-semibold">Add editable controls</h2>
          <p className="text-xs text-neutral-400 mt-1">Choose what becomes adjustable, or let the model decide.</p>
        </div>
        <button type="button" onClick={handleClose} aria-label={loading ? 'Cancel running conversion' : 'Close conversion dialog'} className="shrink-0 rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
          <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading && <GenerationProgress active task="convert" className="shrink-0 p-4 border-b border-neutral-700 text-sm text-amber-200" />}

      {error && (
        <div className="max-h-40 shrink-0 overflow-y-auto p-4 space-y-3 border-b border-neutral-700">
          <p role="alert" className="break-words text-sm text-red-300">{error}</p>
          {onOpenSettings && <button type="button" onClick={onOpenSettings} className="btn-secondary text-sm">Model settings</button>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="min-h-0 flex flex-col">
        <div className="min-h-0 overflow-y-auto p-4 space-y-4">
          {currentPrompt && (
            <div className="min-w-0 px-3 py-2 bg-neutral-950 rounded-md">
              <span className="text-xs text-neutral-400">Current asset:</span>
              <p className="text-sm text-neutral-300 break-words line-clamp-2" title={currentPrompt}>{currentPrompt}</p>
            </div>
          )}
          <div>
            <label htmlFor="conversion-guidance" className="block text-sm font-medium text-neutral-300 mb-2">What would you like to control? (optional)</label>
            <textarea ref={inputRef} id="conversion-guidance" value={guidance} onChange={event => setGuidance(event.target.value)} disabled={loading}
              aria-describedby="conversion-guidance-help" placeholder="e.g., Make floor count, room count, and roof pitch adjustable."
              className="w-full min-w-0 h-28 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-md text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none disabled:opacity-60" />
            <p id="conversion-guidance-help" className="mt-2 text-xs text-neutral-400">Leave blank for automatic controls. The model will aim to preserve the current appearance.</p>
          </div>
        </div>
        <div className="p-4 shrink-0 border-t border-neutral-700 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={handleClose} className="btn-secondary text-sm">{loading ? 'Cancel conversion request' : 'Cancel'}</button>
          <button type="submit" disabled={loading} className="btn-helios text-sm">{loading ? 'Converting...' : 'Add editable controls'}</button>
        </div>
      </form>
    </Modal>
  )
}
