import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AssetStats from './AssetStats'
import ExportPanel from './ExportPanel'
import PreviewCanvas from './PreviewCanvas'

describe('isolated asset UI', () => {
  it('enables GLB export for assets without a host root', () => {
    const html = renderToStaticMarkup(<ExportPanel asset={{ isIsolated: true }} />)
    const button = html.match(/<button[^>]*>Download GLB<\/button>/)?.[0]
    expect(button).toBeTruthy()
    expect(button).not.toContain('disabled')
  })

  it('uses zero-valued metadata without inspecting generated roots or callbacks', () => {
    const asset = {
      isIsolated: true, triangleCount: 0, hasAnimation: false,
      get root() { throw new Error('No generated root in the host') },
      get tick() { throw new Error('No generated callback in the host') },
    }
    const html = renderToStaticMarkup(<AssetStats asset={asset} mode="creative" />)
    expect(html).toContain('Static')
    expect(html).toContain('>0</span>')
  })

  it('does not route unsupported generated assets to the local renderer', () => {
    const html = renderToStaticMarkup(<PreviewCanvas asset={{ isCodeGenerated: true }} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('isolated runtime')
  })
})
