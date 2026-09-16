import React, { useState } from 'react'

export default function PromptInput({ onGenerate, loading, disabled = loading, children }) {
  const [prompt, setPrompt] = useState('')
  const [showExamples, setShowExamples] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (prompt.trim() && !disabled) {
      onGenerate(prompt.trim())
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const examplePrompts = [
    'A swarm of colorful butterflies',
    'A pine tree swaying in the wind',
    'Magical fireflies floating around',
    'A small cottage with a chimney',
    'A cluster of mossy rocks'
  ]

  return (
    <form onSubmit={handleSubmit} className="prompt-form">
      <div className="prompt-entry">
        <input
          type="text"
          aria-label="Describe your asset"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to create..."
          className="input-dark flex-1"
          disabled={disabled}
        />
        <button
          type="submit"
          disabled={disabled || !prompt.trim()}
          className="btn-helios min-w-[120px] flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="spinner" />
              <span>Generating...</span>
            </>
          ) : (
            <span>Generate</span>
          )}
        </button>
      </div>
      
      <div className="prompt-options">
        <button type="button" disabled={disabled} className="examples-toggle" aria-expanded={showExamples} aria-controls="prompt-examples" onClick={() => setShowExamples(value => !value)}>Prompt ideas <span aria-hidden="true">{showExamples ? '−' : '+'}</span></button>
        {children}
      </div>
      {showExamples && <div id="prompt-examples" className="flex flex-wrap gap-2 mt-2">
        <span className="text-gray-500 text-sm">Try:</span>
        {examplePrompts.map((example, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setPrompt(example); setShowExamples(false) }}
            className="text-sm px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-helios-400 hover:bg-gray-700 transition-colors"
            disabled={disabled}
          >
            {example}
          </button>
        ))}
      </div>}
    </form>
  )
}
