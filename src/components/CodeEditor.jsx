import React, { useState, useEffect, useRef } from 'react'

/**
 * Simple code editor for viewing/editing generated ThreeJS code
 * Uses a textarea with syntax highlighting simulation (for simplicity)
 * Could be upgraded to Monaco editor for production
 */
export default function CodeEditor({ code, onChange, readOnly = false, appliedCode = code }) {
  const [editMode, setEditMode] = useState(false)
  const [editedCode, setEditedCode] = useState(code || '')
  const textareaRef = useRef(null)
  const editStartCodeRef = useRef(editedCode)
  const isDraft = editedCode !== (appliedCode || '')
  
  // Sync with external code changes
  useEffect(() => {
    if (!editMode) {
      setEditedCode(code || '')
    }
  }, [code, editMode])
  
  const handleEditToggle = () => {
    if (editMode) {
      // Exiting edit mode - save changes
      if (onChange && editedCode !== code) {
        onChange(editedCode)
      }
    } else {
      editStartCodeRef.current = editedCode
    }
    setEditMode(!editMode)
  }

  const handleCancel = () => {
    const restoredCode = editStartCodeRef.current
    setEditedCode(restoredCode)
    onChange?.(restoredCode)
    setEditMode(false)
  }
  
  const handleChange = (e) => {
    setEditedCode(e.target.value)
    onChange?.(e.target.value)
  }
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedCode)
      // Could add toast notification here
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
  
  if (!code && !editMode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4">
        Generate an asset to see its code here
      </div>
    )
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700">
        <span className="text-xs text-gray-400">
          {editMode ? 'Editing...' : 'JavaScript'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title={isDraft ? 'Copy unapplied editor changes. Downloads still use the last working source.' : 'Copy the generator function only, without saved seed or slider values.'}
          >
            {isDraft ? 'Copy draft' : 'Copy source'}
          </button>
          {!readOnly && editMode && (
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            >
              Cancel
            </button>
          )}
          {!readOnly && (
            <button
              onClick={handleEditToggle}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                editMode
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {editMode ? 'Save' : 'Edit'}
            </button>
          )}
        </div>
      </div>
      
      {/* Code Display/Editor */}
      <div className="flex-1 min-h-0 overflow-auto bg-gray-900">
        {editMode ? (
          <textarea
            aria-label="Asset code draft"
            ref={textareaRef}
            value={editedCode}
            onChange={handleChange}
            className="w-full h-full p-4 bg-gray-900 text-gray-100 font-mono text-xs resize-none focus:outline-none"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        ) : (
          <pre className="p-4 text-xs font-mono overflow-auto h-full">
            <code className="text-gray-100">
              {highlightCode(editedCode)}
            </code>
          </pre>
        )}
      </div>
    </div>
  )
}

/**
 * Simple syntax highlighting for JavaScript
 * Returns React elements with colored spans
 */
function highlightCode(code) {
  if (!code) return null
  
  // Keywords
  const keywords = /\b(function|return|const|let|var|if|else|for|while|new|this|true|false|null|undefined|typeof|instanceof)\b/g
  
  // Numbers
  const numbers = /\b(\d+\.?\d*)\b/g
  
  // Strings
  const strings = /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g
  
  // Comments
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm
  
  // THREE namespace
  const threeApi = /\bTHREE\.(\w+)\b/g
  
  // Process the code
  let result = code
  const replacements = []
  
  // Collect all matches with their positions
  let match
  
  // Comments (highest priority)
  const commentRegex = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm
  while ((match = commentRegex.exec(code)) !== null) {
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      className: 'text-gray-500'
    })
  }
  
  // Build highlighted elements
  const elements = []
  let lastIndex = 0
  
  // Sort replacements by position
  replacements.sort((a, b) => a.start - b.start)
  
  // For simplicity, just return with basic highlighting via CSS classes
  // Split into lines for better rendering
  const lines = code.split('\n')
  
  return lines.map((line, i) => (
    <div key={i} className="whitespace-pre">
      {highlightLine(line)}
    </div>
  ))
}

function highlightLine(line) {
  // Very basic highlighting - could be improved
  const tokens = []
  let remaining = line
  let key = 0
  
  // Match patterns in order
  const patterns = [
    { regex: /(\/\/.*)/, className: 'text-gray-500' },  // Comments
    { regex: /(["'`](?:[^"'`\\]|\\.)*["'`])/, className: 'text-green-400' },  // Strings
    { regex: /\b(function|return|const|let|var|if|else|for|while|new|this|async|await)\b/, className: 'text-purple-400' },  // Keywords
    { regex: /\b(true|false|null|undefined)\b/, className: 'text-orange-400' },  // Literals
    { regex: /\bTHREE\.(\w+)/, className: 'text-cyan-400' },  // THREE API
    { regex: /\b(\d+\.?\d*)\b/, className: 'text-yellow-400' },  // Numbers
  ]
  
  while (remaining.length > 0) {
    let matched = false
    
    for (const { regex, className } of patterns) {
      const match = remaining.match(regex)
      if (match && match.index === 0) {
        tokens.push(
          <span key={key++} className={className}>
            {match[0]}
          </span>
        )
        remaining = remaining.slice(match[0].length)
        matched = true
        break
      }
    }
    
    if (!matched) {
      // Check if any pattern matches later in the string
      let nextMatch = null
      let nextMatchIndex = remaining.length
      
      for (const { regex, className } of patterns) {
        const match = remaining.match(regex)
        if (match && match.index < nextMatchIndex) {
          nextMatch = { match, className }
          nextMatchIndex = match.index
        }
      }
      
      if (nextMatch && nextMatchIndex > 0) {
        // Add unmatched text
        tokens.push(<span key={key++}>{remaining.slice(0, nextMatchIndex)}</span>)
        remaining = remaining.slice(nextMatchIndex)
      } else {
        // No more matches, add rest as plain text
        tokens.push(<span key={key++}>{remaining}</span>)
        break
      }
    }
  }
  
  return tokens.length > 0 ? tokens : ' '
}
