import React from 'react'
import './welcome.css'

/** First-run entry points for an empty asset viewport. */
export default function WorkspaceWelcome({ onBrowseTemplates, onConnectModel, disabled = false }) {
  return (
    <section className="workspace-welcome" aria-label="Get started">
      <div className="workspace-welcome-content">
        <h2>Turn text into editable Three.js. Export as GLB.</h2>
        <p className="workspace-welcome-copy">
          Start with an example, adjust its controls, and explore it in the viewport.
          Connect a model when you're ready to generate from your own prompt.
        </p>
        <div className="workspace-welcome-actions">
          <div className="workspace-welcome-action">
            <button
              type="button"
              className="workspace-welcome-button workspace-welcome-primary"
              onClick={onBrowseTemplates}
              disabled={disabled}
            >
              Try an example
            </button>
            <p>No API key or credits needed.</p>
          </div>
          <div className="workspace-welcome-action">
            <button
              type="button"
              className="workspace-welcome-button"
              onClick={onConnectModel}
              disabled={disabled}
            >
              Connect a model
            </button>
            <p>Requires an OpenAI or Anthropic API key. Usage is billed directly by your provider.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
