import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createAssetDocument } from '../services/assetDocument'

const boundary = vi.hoisted(() => ({ state: null, export: null, spec: null, preview: null }))
// SSR supplies workspace snapshots without mounting browser workers or issuing requests.
vi.mock('../hooks/useAssetWorkspace', () => ({ useAssetWorkspace: () => boundary.state }))
vi.mock('./ExportPanel', async importOriginal => {
  const { default: Component } = await importOriginal()
  return { default: props => { boundary.export = props; return <Component {...props} /> } }
})
// The editor is browser-only and lazy-loaded; its real rendering is covered by
// smoke-spec-editor. Here the boundary checks which committed spec App passes.
vi.mock('./SpecEditor', () => ({
  default: props => { boundary.spec = props; return <pre>{JSON.stringify(props.spec)}</pre> }
}))
vi.mock('./PreviewCanvas', async importOriginal => {
  const { default: Component } = await importOriginal()
  const { forwardRef } = await import('react')
  return { default: forwardRef((props, ref) => { boundary.preview = props; return <Component {...props} ref={ref} /> }) }
})

const code = 'function createAsset(THREE, seed, textures, params) { return { root: new THREE.Group() } }'
function setSnapshot(mode = 'procedural', pending = 'parameters') {
  const document = createAssetDocument(mode === 'curated' ? {
    mode, seed: 0, spec: { generator: 'rockCluster', params: { count: 2 } },
  } : {
    mode, code, seed: 0, params: { size: 1, height: 2 },
    schema: { size: { type: 'number', default: 1, max: 10 }, height: { type: 'number', default: 2, max: 10 } },
    textureSlots: [{ id: 'wall', label: 'Wall' }],
  })
  boundary.state = {
    current: { document, asset: { isIsolated: true, triangleCount: 12, hasAnimation: false }, revision: 9, sourceRevision: 1 },
    pending, parameterDraft: pending === 'parameters' ? { ...document.params, ...(mode === 'curated' ? { count: 7 } : { size: 5, height: 8 }) } : null,
    error: null, actions: {}, cancel: () => {},
  }
}

// Inspect rendered HTML controls, including inherited fieldset disabling.
// This does not inspect source text or replace any inspector/control components.
function controls(html) {
  const fieldsets = []
  const result = []
  for (const match of html.matchAll(/<\/?fieldset\b[^>]*>|<input\b[^>]*>|<button\b[^>]*>[\s\S]*?<\/button>/g)) {
    const node = match[0]
    if (node.startsWith('</fieldset')) { fieldsets.pop(); continue }
    if (node.startsWith('<fieldset')) { fieldsets.push(/\sdisabled(?:\s|=|>)/.test(node)); continue }
    result.push({ html: node, text: node.replace(/<[^>]+>/g, '').trim(), disabled: fieldsets.includes(true) || /\sdisabled(?:\s|=|>)/.test(node) })
  }
  return result
}
const slider = (nodes, name) => nodes.find(node => node.html.includes(`aria-label="${name}"`) && node.html.includes('type="range"'))

beforeEach(() => { setSnapshot() })

describe('App parameter scheduling contract', () => {
  it('offers one generation workflow with templates reachable separately', () => {
    setSnapshot('procedural', null)
    const nodes = controls(renderToStaticMarkup(<App />))
    expect(nodes.some(node => node.text === 'Browse templates')).toBe(true)
    for (const name of ['Curated', 'Creative', 'Procedural']) {
      expect(nodes.some(node => node.text === name)).toBe(false)
    }
  })
  it('shows optimistic slider values without passing draft inputs to export or preview', () => {
    const committed = boundary.state.current.document
    const nodes = controls(renderToStaticMarkup(<App />))
    expect(slider(nodes, 'size').html).toContain('value="5"')
    expect(slider(nodes, 'height').html).toContain('value="8"')
    expect(boundary.export.params).toBe(committed.params)
    expect(boundary.export.assetDocument).toBe(committed)
    expect(boundary.export.params).toEqual({ size: 1, height: 2 })
    expect(boundary.preview.asset).toBe(boundary.state.current.asset)
  })

  it('keeps only parameter controls and cancellation enabled during parameter builds', () => {
    const nodes = controls(renderToStaticMarkup(<App />))
    expect(slider(nodes, 'size').disabled).toBe(false)
    expect(slider(nodes, 'height').disabled).toBe(false)
    expect(nodes.find(node => node.html.includes('aria-label="Cancel parameter updates"'))?.disabled).toBe(false)
    for (const name of ['AI Edit', 'Add Animation', 'Re-run', 'Edit', 'New variation', 'Download GLB', 'Download .js', 'Save to Library', 'Browse templates', 'Library']) {
      expect(nodes.find(node => node.text === name)?.disabled, name).toBe(true)
    }
    expect(nodes.find(node => node.html.includes('aria-label="Describe your asset"')).disabled).toBe(true)
    expect(nodes.find(node => node.html.includes('aria-label="Model settings:')).disabled).toBe(true)
    expect(nodes.find(node => node.html.includes('class="examples-toggle"')).disabled).toBe(true)
    expect(nodes.filter(node => node.html.includes('type="file"')).every(node => node.disabled)).toBe(true)
  })

  it('keeps parameter progress inside the existing header without a generating spinner or top request row', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).not.toContain('Generating...')
    expect(html).not.toContain('Preparing asset...')
    expect(html).not.toContain('class="request-status"')
    expect(html).toMatch(/class="panel-header[^>]*>[\s\S]*?aria-label="Parameter update status"/)
    expect(html).toContain('Updating...')
  })

  it('uses optimistic curated params only in the parameter inspector, not the spec or export', () => {
    setSnapshot('curated')
    const committed = boundary.state.current.document
    const nodes = controls(renderToStaticMarkup(<App />))
    expect(slider(nodes, 'count').html).toContain('value="7"')
    expect(slider(nodes, 'count').disabled).toBe(false)
    expect(boundary.spec.spec).toBe(committed.spec)
    expect(boundary.export.spec).toBe(committed.spec)
    expect(committed.params.count).toBe(2)
  })

  it.each(['generate', 'load', 'rerun', 'edit'])('disables parameter controls during %s', pending => {
    setSnapshot('procedural', pending)
    const nodes = controls(renderToStaticMarkup(<App />))
    expect(slider(nodes, 'size').disabled).toBe(true)
    expect(slider(nodes, 'size').html).toContain('value="1"')
  })

  it('reverts controls to committed inputs when a failed draft clears', () => {
    expect(slider(controls(renderToStaticMarkup(<App />)), 'size').html).toContain('value="5"')
    boundary.state = { ...boundary.state, pending: null, parameterDraft: null, error: 'Build failed' }
    const html = renderToStaticMarkup(<App />)
    expect(slider(controls(html), 'size').html).toContain('value="1"')
    expect(slider(controls(html), 'size').disabled).toBe(false)
    expect(html).toContain('Build failed')
  })

  it('passes source continuity rather than parameter-build revision to the preview', () => {
    renderToStaticMarkup(<App />)
    expect(boundary.preview.continuityKey).toBe(1)
    boundary.state.current = { ...boundary.state.current, revision: 10 }
    renderToStaticMarkup(<App />)
    expect(boundary.preview.continuityKey).toBe(1)
  })
})
