import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import ParameterInspector from './ParameterInspector'
import { validateSpec } from '../schemas/assetSpec'

it('renders the saved modular footprint instead of misleading defaults', () => {
  const spec = validateSpec({ generator: 'buildingModular', params: { footprint: { shape: 'L', width: 17, depth: 9 } }, seed: 0 })
  const html = renderToStaticMarkup(<ParameterInspector spec={spec} />)
  const width = html.match(/<input[^>]*aria-label="footprint.width"[^>]*>/)?.[0]
  expect(width).toContain('value="17"')
  expect(html).toContain('<option value="L" selected="">L</option>')
})

it('uses whole-number steps for template counts accepted by the schema', () => {
  const spec = validateSpec({ generator: 'rockCluster', params: { count: 3 }, seed: 0 })
  const html = renderToStaticMarkup(<ParameterInspector spec={spec} />)
  expect(html.match(/<input[^>]*aria-label="count"[^>]*>/)?.[0]).toContain('step="1"')
})
