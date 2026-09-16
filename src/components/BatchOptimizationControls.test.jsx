import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BatchOptimizationControls from './BatchOptimizationControls'

describe('batch optimization controls', () => {
  it('offers an automatic operation without an API call', () => {
    const html = renderToStaticMarkup(<BatchOptimizationControls disabled />)
    expect(html).toContain('Optimize layout')
    expect(html).toContain('disabled')
    expect(html).toContain('No API call')
  })

  it('labels renderer counts honestly, including transmission passes but excluding shadows', () => {
    const result = { available: true, enabled: true, before: { calls: 5, triangles: 60 }, after: { calls: 3, triangles: 60 } }
    const html = renderToStaticMarkup(<BatchOptimizationControls result={result} />)
    expect(html).toContain('aria-label="Original draw calls">5')
    expect(html).toContain('aria-label="Optimized draw calls">3')
    expect(html).toContain('including studio guides and transmission passes; excluding shadows')
    expect(html).toContain('No triangles removed')
    expect(html).toContain('culling granularity')
    expect(html).toContain('aria-pressed="true">Optimized')
  })

  it('explains an unsupported layout without offering a misleading optimized toggle', () => {
    const html = renderToStaticMarkup(<BatchOptimizationControls result={{ available: false, report: { reason: 'Animation is unsupported.' } }} />)
    expect(html).toContain('Animation is unsupported.')
    expect(html).not.toContain('Compare layouts')
  })
})
