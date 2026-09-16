import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ProviderSettings, { ModelSettingsButton, RequestStatus } from './ProviderSettings'
import { generationProgress } from '../api/generationProgress'

describe('request progress status', () => {
  it('shows an executing operation independently of the transport pending count', () => {
    const operation = generationProgress.start('creative')
    operation.report('execution', { attempt: 2, repairAttempt: 1 })
    try {
      const html = renderToStaticMarkup(<RequestStatus onCancelRequest={() => {}} />)
      expect(html).toContain('Executing and validating generated code')
      expect(html).toContain('Elapsed 0:00')
      expect(html).toContain('Repair requests: 1 (included above)')
      expect(html).toContain('Cancel request')
    } finally { operation.finish() }
    expect(renderToStaticMarkup(<RequestStatus />)).toBe('')
  })

  it('preserves the disabled-state fallback for work without a service operation', () => {
    expect(renderToStaticMarkup(<RequestStatus disabled />)).toContain('Preparing asset...')
  })
})

describe('provider key indicator', () => {
  it('describes the unconfirmed key status before settings have loaded', () => {
    const html = renderToStaticMarkup(<ProviderSettings />)
    expect(html).toContain('title="Checking API key configuration..."')
    expect(html).toContain('aria-description="Checking API key configuration..."')
    expect(html).not.toContain('is-connected')
  })

  it.each([
    ['anthropic', 'Anthropic', 'environment', 'server environment'],
    ['anthropic', 'Anthropic', 'session', 'session entry'],
    ['openai', 'OpenAI', 'environment', 'server environment'],
    ['openai', 'OpenAI', 'session', 'session entry'],
  ])('marks %s (%s) configured with a %s key', (provider, name, keySource, sourceLabel) => {
    const settings = {
      provider,
      providers: {
        anthropic: { model: 'anthropic-model', keySource: null },
        openai: { model: 'openai-model', keySource: null },
      },
    }
    settings.providers[provider].keySource = keySource
    const html = renderToStaticMarkup(<ModelSettingsButton settings={settings} />)
    expect(html).toContain('connection-dot is-connected')
    expect(html).toContain(`${name}: API key configured (${sourceLabel})`)
    expect(html).toContain('Connection not tested')
    expect(html).toContain('aria-description=')
  })

  it.each(['anthropic', 'openai'])('does not use the other provider\'s key for %s status', provider => {
    const settings = {
      provider,
      providers: {
        anthropic: { model: 'anthropic-model', keySource: 'environment' },
        openai: { model: 'openai-model', keySource: 'session' },
      },
    }
    settings.providers[provider].keySource = null
    const html = renderToStaticMarkup(<ModelSettingsButton settings={settings} />)
    expect(html).not.toContain('is-connected')
    expect(html).toContain('No API key configured')
  })

  it('does not claim settings are still loading after a failed status request', () => {
    const html = renderToStaticMarkup(<ModelSettingsButton error="Service unavailable" />)
    expect(html).toContain('Unable to check API key configuration')
    expect(html).not.toContain('is-connected')
  })
})
