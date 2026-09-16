import React, { lazy, Suspense } from 'react'

const Editor = lazy(() => import('./LocalSpecEditor'))

export default function SpecEditor({ spec }) {
  const jsonContent = spec 
    ? JSON.stringify(spec, null, 2) 
    : '// Generate an asset to see its spec here'

  return (
    <Suspense fallback={<div className="p-3 text-xs text-gray-400">Loading template settings...</div>}>
      <Editor
        height="100%"
        language="json"
        value={jsonContent}
        theme="vs-dark"
        options={{
          readOnly: true,
          // Select complete JSON values, including hex colors and hyphenated IDs.
          wordSeparators: '[]{}:,"',
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          folding: true,
          automaticLayout: true,
          padding: { top: 12, bottom: 12 }
        }}
      />
    </Suspense>
  )
}
