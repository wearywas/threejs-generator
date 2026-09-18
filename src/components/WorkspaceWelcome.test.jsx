import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkspaceWelcome from './WorkspaceWelcome'

afterEach(() => vi.unstubAllGlobals())

function buttonsIn(element) {
  if (!React.isValidElement(element)) return []
  if (element.type === 'button') return [element]
  return React.Children.toArray(element.props.children).flatMap(buttonsIn)
}

describe('WorkspaceWelcome', () => {
  it('offers the experimental connection when available without changing the free examples claim', () => {
    const html = renderToStaticMarkup(<WorkspaceWelcome codexAvailable />)
    expect(html).toContain('API key or experimental Codex connection')
    expect(html).not.toContain('Requires an OpenAI or Anthropic API key')
    expect(html).toContain('No API key or credits needed.')
  })
  it('explains the text-to-editable-Three.js-to-GLB workflow with a no-key starting point', () => {
    const html = renderToStaticMarkup(<WorkspaceWelcome />)
    const heading = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1] || ''

    expect(heading).toMatch(/text[\s\S]*editable Three\.js[\s\S]*GLB/i)
    expect(html).toContain('Try an example')
    expect(html).toContain('No API key or credits needed.')
    expect(html).toContain('Connect a model')
    expect(html).toMatch(/Connect a model<\/button><p>Requires an OpenAI or Anthropic API key\. Usage is billed directly by your provider\.<\/p>/)
  })

  it('only opens the requested entry point when its action is chosen', () => {
    const onBrowseTemplates = vi.fn()
    const onConnectModel = vi.fn()
    const buttons = buttonsIn(WorkspaceWelcome({ onBrowseTemplates, onConnectModel }))
    const example = buttons.find(button => button.props.children === 'Try an example')
    const connect = buttons.find(button => button.props.children === 'Connect a model')

    expect(example).toBeDefined()
    expect(connect).toBeDefined()
    expect(example.props.type).toBe('button')
    expect(connect.props.type).toBe('button')
    example.props.onClick()
    expect(onBrowseTemplates).toHaveBeenCalledTimes(1)
    expect(onConnectModel).not.toHaveBeenCalled()
    connect.props.onClick()
    expect(onConnectModel).toHaveBeenCalledTimes(1)
    expect(onBrowseTemplates).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('honors the workspace busy state (disabled=%s)', disabled => {
    const html = renderToStaticMarkup(<WorkspaceWelcome disabled={disabled} />)
    const buttons = html.match(/<button\b[^>]*>/g) || []

    expect(buttons).toHaveLength(2)
    expect(buttons.filter(button => button.includes('disabled=""'))).toHaveLength(disabled ? 2 : 0)
  })

  it('does not request generation or open either entry point on render', () => {
    const fetch = vi.fn()
    const onBrowseTemplates = vi.fn()
    const onConnectModel = vi.fn()
    vi.stubGlobal('fetch', fetch)

    renderToStaticMarkup(<WorkspaceWelcome onBrowseTemplates={onBrowseTemplates} onConnectModel={onConnectModel} />)

    expect(fetch).not.toHaveBeenCalled()
    expect(onBrowseTemplates).not.toHaveBeenCalled()
    expect(onConnectModel).not.toHaveBeenCalled()
  })
})
