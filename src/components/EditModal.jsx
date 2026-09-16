import React, { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import GenerationProgress from './GenerationProgress'

export default function EditModal({ isOpen, onClose, onEdit, onCancelRequest, loading, currentPrompt, error = '', onOpenSettings }) {
  const [editPrompt, setEditPrompt] = useState('')
  const inputRef = useRef(null)
  const handleClose = loading ? onCancelRequest : onClose

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
    if (isOpen) {
      setEditPrompt('')
    }
  }, [isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editPrompt.trim() && !loading) {
      onEdit(editPrompt.trim())
    }
  }

  const suggestions = [
    "Add texture slots for the wings",
    "Add a glow effect",
    "Make it bigger",
    "Add more detail",
    "Change the colors to be more vibrant",
    "Add subtle animation",
    "Add texture support for all surfaces"
  ]

  if (!isOpen) return null

  return (
    <Modal labelledBy="generative-edit-heading" onClose={handleClose} className="w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 p-4 border-b border-neutral-700">
          <div className="min-w-0">
            <h2 id="generative-edit-heading" className="text-base font-semibold text-neutral-100 flex items-center gap-2">
              <svg aria-hidden="true" className="w-4 h-4 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Generative Edit
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Describe how you'd like to modify this asset
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={loading ? 'Cancel running edit' : 'Close edit dialog'}
            className="shrink-0 rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && <GenerationProgress active task="edit" className="shrink-0 p-4 border-b border-neutral-700 text-sm text-amber-200" />}

        {error && (
          <div className="max-h-40 shrink-0 overflow-y-auto p-4 space-y-3 border-b border-neutral-700">
            <p role="alert" className="break-words text-sm text-red-300">{error}</p>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                Model settings
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* Current Asset Info */}
          {currentPrompt && (
            <div className="min-w-0 px-3 py-2 bg-neutral-950 rounded-md">
              <span className="text-xs text-neutral-400">Current asset:</span>
              <p className="text-sm text-neutral-300 break-words line-clamp-2" title={currentPrompt}>{currentPrompt}</p>
            </div>
          )}

          {/* Edit Input */}
          <form onSubmit={handleSubmit}>
            <label htmlFor="editPrompt" className="block text-sm font-medium text-neutral-300 mb-2">
              What would you like to change?
            </label>
            <textarea
              ref={inputRef}
              id="editPrompt"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="e.g., Add texture slots for the wings and body..."
              className="w-full min-w-0 h-24 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-md text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              disabled={loading}
            />
          </form>

          {/* Quick Suggestions */}
          <div>
            <p className="text-xs text-neutral-400 mb-2">Quick suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => setEditPrompt(suggestion)}
                  disabled={loading}
                  className="max-w-full text-left px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-xs text-neutral-300 hover:text-neutral-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 shrink-0 border-t border-neutral-700 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {loading ? 'Cancel edit request' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!editPrompt.trim() || loading}
            className="px-3 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-950 rounded-md text-sm font-semibold flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            {loading ? (
              <>
                <svg aria-hidden="true" className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Editing...
              </>
            ) : (
              <>
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Apply Edit
              </>
            )}
          </button>
        </div>
    </Modal>
  )
}
