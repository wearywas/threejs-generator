import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AssetStats from './AssetStats'

describe('AssetStats geometry hints', () => {
  it('keeps every advisory reason in a closed native disclosure while preserving the main stats', () => {
    const reasons = ['The asset may be unusually thin.', 'Several parts may be disconnected.', 'Check the silhouette from another angle.']
    const html = renderToStaticMarkup(<AssetStats
      asset={{ isIsolated: true, triangleCount: 1200, hasAnimation: true, criticEvaluation: { accepted: false, reasons } }}
      mode="procedural"
    />)
    const disclosure = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0]

    expect(disclosure).toBeDefined()
    expect(disclosure).toMatch(/<summary\b[^>]*>Geometry hints<\/summary>/)
    expect(disclosure).not.toMatch(/^<details[^>]*\bopen(?:\s|=|>)/)
    expect(disclosure).toMatch(/heuristic/i)
    expect(disclosure).toMatch(/advisory/i)
    expect(disclosure).not.toContain('role="alert"')
    for (const reason of reasons) expect(disclosure).toContain(reason)

    const outside = html.replace(disclosure, '')
    expect(outside).toContain('Triangles')
    expect(outside).toContain('1.2K')
    expect(outside).toContain('Animated')
    expect(outside).toContain('Editable controls')
    for (const reason of reasons) expect(outside).not.toContain(reason)
  })

  it.each([undefined, { accepted: true, reasons: [] }])('does not add a hints disclosure when there are no critic warnings', criticEvaluation => {
    const html = renderToStaticMarkup(<AssetStats asset={{ isIsolated: true, triangleCount: 0, criticEvaluation }} />)

    expect(html).not.toContain('<details')
    expect(html).toContain('Triangles')
  })

  it('keeps the existing empty state when no asset is loaded', () => {
    const html = renderToStaticMarkup(<AssetStats />)

    expect(html).toContain('Generate an asset to see stats')
    expect(html).not.toContain('<details')
  })
})
