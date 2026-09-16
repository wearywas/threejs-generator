import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'

const MAX_TAGS = 10

function mergeTags(tags, input) {
  const added = input.split(/[,\r\n]+/)
    .map(tag => tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean)
  return [...new Set([...tags, ...added])].slice(0, MAX_TAGS)
}

/**
 * Modal for saving a generation to the library
 * Allows users to set a name, add tags, and preview the thumbnail
 */
export default function SaveToLibraryModal({ 
  isOpen, 
  onClose, 
  onSave, 
  thumbnail, 
  defaultName = '',
  isCapturing = false 
}) {
  const [name, setName] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef(null)

  // Focus after Modal has captured the opener for focus restoration.
  useEffect(() => {
    if (isOpen) nameRef.current?.focus()
  }, [isOpen])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setError('')
      // Generate a smart default name from the prompt
      const smartName = defaultName
        .split(/\s+/)
        .slice(0, 5)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
      setName(smartName || 'Untitled Asset')
      setTags([])
      setTagInput('')
    }
  }, [isOpen, defaultName])

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      setTags(current => mergeTags(current, tagInput))
      setTagInput('')
    }
  }

  const handlePasteTags = (e) => {
    const pasted = e.clipboardData.getData('text/plain')
    // Handle newlines before a text input's native paste strips them out.
    if (!/[,\r\n]/.test(pasted)) return
    e.preventDefault()
    const { selectionStart, selectionEnd } = e.currentTarget
    const input = tagInput.slice(0, selectionStart) + pasted + tagInput.slice(selectionEnd)
    setTags(current => mergeTags(current, input))
    setTagInput('')
  }

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  const handleSave = async () => {
    if (!name.trim()) return
    
    setSaving(true)
    setError('')
    try {
      await onSave({
        name: name.trim(),
        customTags: mergeTags(tags, tagInput)
      })
      onClose()
    } catch (err) {
      console.error('Save failed:', err)
      setError(err.message || 'Could not save the asset. Your preview is still available.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal labelledBy="save-library-heading" onClose={onClose} dismissOnBackdrop={false} className="w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 p-4 border-b border-neutral-700">
          <div className="min-w-0">
            <h2 id="save-library-heading" className="text-base font-semibold text-neutral-100">Save to Library</h2>
            <p className="text-xs text-neutral-400 mt-1">Name your asset and add tags</p>
          </div>
          <button
            type="button"
            aria-label="Close save dialog"
            onClick={onClose}
            className="shrink-0 rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* Thumbnail Preview */}
          <div className="flex justify-center">
            <div className="w-32 h-32 rounded-lg border border-neutral-700 overflow-hidden bg-neutral-950 flex items-center justify-center">
              {isCapturing ? (
                <div role="status" className="flex flex-col items-center gap-2 text-neutral-400">
                  <svg aria-hidden="true" className="w-6 h-6 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm">Capturing...</span>
                </div>
              ) : thumbnail ? (
                <img 
                  src={thumbnail} 
                  alt="Asset thumbnail" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-neutral-400">
                  <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">No preview</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Name Input */}
          <div>
            <label htmlFor="asset-name" className="block text-sm font-medium text-neutral-300 mb-2">
              Name <span className="text-neutral-400">(required)</span>
            </label>
            <input
              ref={nameRef}
              id="asset-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name for this asset"
              className="w-full min-w-0 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-md text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              maxLength={100}
            />
          </div>
          
          {/* Tags Input */}
          <div>
            <label htmlFor="asset-tags" className="block text-sm font-medium text-neutral-300 mb-2">
              Tags <span className="text-neutral-400">(optional)</span>
            </label>
            
            {/* Tags Display */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map(tag => (
                  <span 
                    key={tag}
                    className="inline-flex max-w-full items-center gap-1 pl-2 pr-1 py-0.5 bg-neutral-800 text-neutral-200 rounded-md text-sm border border-neutral-700"
                  >
                    <span className="min-w-0 break-all">{tag}</span>
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => handleRemoveTag(tag)}
                      className="shrink-0 rounded p-1.5 hover:text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    >
                      <svg aria-hidden="true" className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            <input
              id="asset-tags"
              aria-describedby="asset-tags-hint"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              onPaste={handlePasteTags}
              placeholder="Type a tag and press Enter"
              className="w-full min-w-0 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-md text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              disabled={tags.length >= MAX_TAGS}
            />
            <p id="asset-tags-hint" className="text-xs text-neutral-400 mt-1">
              Press Enter or comma, or paste a list to add tags ({MAX_TAGS - tags.length} remaining)
            </p>
          </div>
        </div>
        
        {error && <p role="alert" className="px-4 py-2 break-words text-sm text-red-300">{error}</p>}
        {/* Footer */}
        <div className="p-4 shrink-0 border-t border-neutral-700 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || saving || isCapturing}
            className="px-3 py-2 bg-amber-400 text-neutral-950 text-sm font-semibold rounded-md hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            {saving ? (
              <>
                <svg aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save to Library
              </>
            )}
          </button>
        </div>
    </Modal>
  )
}
