import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CodeEditor from './CodeEditor'

describe('CodeEditor copy labels', () => {
  it('does not direct users to a removed mode when empty', () => {
    const html = renderToStaticMarkup(<CodeEditor />)
    expect(html).toContain('Generate an asset to see its code here')
    expect(html).not.toContain('Creative mode')
  })
  it('identifies source that matches the working asset', () => {
    const html = renderToStaticMarkup(<CodeEditor code="working source" appliedCode="working source" />)
    expect(html).toContain('Copy source')
    expect(html).not.toContain('Copy draft')
  })
  it('identifies unapplied edits as a draft', () => {
    const html = renderToStaticMarkup(<CodeEditor code="unapplied draft" appliedCode="working source" />)
    expect(html).toContain('Copy draft')
    expect(html).toContain('unapplied')
  })
})
