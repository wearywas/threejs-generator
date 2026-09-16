import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DynamicParameterInspector from './DynamicParameterInspector'

function renderControl(name, definition, value = definition.default) {
  return renderToStaticMarkup(<DynamicParameterInspector schema={{ [name]: definition }} params={{ [name]: value }} />)
}

describe('dynamic numeric controls', () => {
  it.each([
    ['branches', { type: 'integer', min: 1, max: 14, default: 7 }],
    ['branchCount', { type: 'number', min: 1, max: 14, default: 7 }],
    ['density', { type: 'number', min: 0, max: 8, default: 3, description: 'Rounded number of leafy lobes per cluster.' }],
  ])('renders whole-number editing for %s', (name, definition) => {
    const html = renderControl(name, definition)
    expect(html).toContain('type="range"')
    expect(html).toContain('step="1"')
    expect(html).not.toContain('>7.00<')
  })

  it('lets the range represent the exact applied decimal instead of browser step rounding', () => {
    const html = renderControl('scale', { type: 'number', min: 0.1, max: 3, default: 1 })
    expect(html).toContain('step="any"')
    expect(html).toContain('value="1"')
  })

  it('exposes a keyboard accessible precise value editor without rounding the label', () => {
    const html = renderControl('scale', { type: 'number', min: 0.1, max: 3, default: 1, label: 'Overall Scale' }, 1.23456)
    expect(html).toMatch(/<button[^>]*aria-label="Edit Overall Scale value"[^>]*>1.23456<\/button>/)
  })
})
