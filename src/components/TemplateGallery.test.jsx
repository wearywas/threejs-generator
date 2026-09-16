import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TemplateGallery from './TemplateGallery'

afterEach(() => vi.unstubAllGlobals())

describe('TemplateGallery', () => {
  it('shows generated starter cards first with accessible load actions and thumbnails', () => {
    const html = renderToStaticMarkup(<TemplateGallery onLoad={() => {}} />)
    const primaryGallery = html.split('<details')[0]
    for (const [id, name] of [
      ['park-apartments', 'Park Apartments'],
      ['woodland-mushrooms', 'Woodland Mushrooms'],
      ['alpine-cottage', 'Alpine Cottage'],
    ]) {
      expect(primaryGallery).toContain(`aria-label="Load ${name} starter"`)
      expect(primaryGallery).toContain(`src="/starters/${id}.png"`)
    }
    expect(primaryGallery).not.toContain('data-template-generator')
    expect(primaryGallery).toContain('No API key or credits needed.')
  })

  it('retains all seven original template actions in a closed native disclosure', () => {
    const html = renderToStaticMarkup(<TemplateGallery onLoad={() => {}} />)
    const disclosure = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0]
    expect(disclosure).toBeDefined()
    expect(disclosure).toMatch(/<summary\b[^>]*>Built-in generators<\/summary>/)
    expect(disclosure).not.toMatch(/^<details[^>]*\bopen(?:\s|=|>)/)
    for (const name of ['Butterfly Swarm', 'Broadleaf Tree', 'Firefly Particles', 'Country Cottage', 'Mossy Rocks', 'Timber House', 'Woodland Scatter']) {
      expect(disclosure).toContain(`aria-label="Load ${name} template"`)
    }
    expect(disclosure.match(/data-template-generator=/g)).toHaveLength(7)
  })

  it('does not fetch or replace an asset merely by rendering the gallery', () => {
    const fetch = vi.fn()
    const onLoad = vi.fn()
    vi.stubGlobal('fetch', fetch)
    renderToStaticMarkup(<TemplateGallery onLoad={onLoad} />)
    expect(fetch).not.toHaveBeenCalled()
    expect(onLoad).not.toHaveBeenCalled()
  })
})
