import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ExportPanel from './ExportPanel'

describe('ExportPanel', () => {
  it.each([
    ['creative', { asset: { isIsolated: true }, code: 'function createAsset() {}' }],
    ['curated', { asset: { root: {} }, spec: { generator: 'rock' } }],
  ])('offers portable exports for a %s asset without a platform-specific menu', (_, props) => {
    const html = renderToStaticMarkup(<ExportPanel {...props} />)

    expect(html).toContain('Download GLB')
    expect(html).toContain('Download .js')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('awe.box')
    expect(html).not.toContain('More export options')
  })

  it('keeps exports disabled until an asset is available', () => {
    const html = renderToStaticMarkup(<ExportPanel />)

    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).toContain('Generate an asset to enable export options')
  })

  it('offers batching in a closed native disclosure without hiding portable exports or animation caveats', () => {
    const html = renderToStaticMarkup(<ExportPanel
      asset={{ isIsolated: true, hasAnimation: true, usedAddons: ['BufferGeometryUtils'] }}
      code="function createAsset() {}"
    />)
    const disclosure = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0]

    expect(disclosure).toBeDefined()
    expect(disclosure).toMatch(/<summary\b[^>]*>Advanced: batching<\/summary>/)
    expect(disclosure).not.toMatch(/^<details[^>]*\bopen(?:\s|=|>)/)
    const outside = html.replace(disclosure, '')
    expect(outside).toContain('Download GLB')
    expect(outside).toContain('Download .js')
    expect(outside).toContain('GLB export will be a static snapshot.')
    expect(outside).toContain('Includes the last working source')
    expect(outside).toContain('Uses addons: BufferGeometryUtils')
  })

  it.each([
    ['empty workspace', {}],
    ['template asset', { asset: { root: {} }, spec: { generator: 'rock' } }],
  ])('does not offer a batching disclosure for an %s without generated source', (_, props) => {
    const html = renderToStaticMarkup(<ExportPanel {...props} />)

    expect(html).not.toContain('Advanced: batching')
    expect(html).not.toContain('Prepare for Batching')
  })
})
