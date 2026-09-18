import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generationProgress } from '../api/generationProgress'
import EditModal from './EditModal'
import ConversionModal from './ConversionModal'
import GenerationProgress from './GenerationProgress'

const transport = vi.hoisted(() => ({ snapshot: { pending: 0 } }))
vi.mock('../api/llmClient', () => ({ llmClient: {
  subscribe: () => () => {}, getSnapshot: () => transport.snapshot,
} }))
// Only replace the browser-native portal/dialog boundary for Node rendering.
vi.mock('./Modal', () => ({ default: ({ children, labelledBy }) => <dialog aria-labelledby={labelledBy}>{children}</dialog> }))

let operation
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  transport.snapshot = { pending: 0 }
})
afterEach(() => {
  operation?.finish()
  vi.useRealTimers()
})
const render = props => renderToStaticMarkup(<GenerationProgress {...props} />)

describe('honest generation progress', () => {
  it('describes Codex allowance while preserving request and repair accounting', () => {
    transport.snapshot = { pending: 1, provider: 'codex' }
    operation = generationProgress.start('creative', { maxAttempts: 3 })
    operation.report('repair', { attempt: 2, repairAttempt: 1 })
    const html = render()
    expect(html).toContain('additional requests consume Codex allowance')
    expect(html).not.toContain('API charges')
    expect(html).toContain('Model request 2')
    expect(html).toContain('Repair requests: 1 (included above)')
  })
  it('shows elapsed time, real attempts and repair billing without percentages or streaming claims', () => {
    operation = generationProgress.start('creative', { maxAttempts: 3 })
    operation.report('model', { attempt: 1 })
    vi.advanceTimersByTime(65000)
    const html = render()
    expect(html).toContain('Waiting for model response')
    expect(html).toContain('Elapsed 1:05')
    expect(html).toContain('Model request 1')
    expect(html).toContain('maximum 3')
    expect(html).not.toContain('Repair requests:')
    expect(html).toMatch(/repairs[^<]*API charges/i)
    expect(html).not.toMatch(/%|progressbar|thinking|reasoning|streaming/i)
    expect(html).toMatch(/role="timer"[^>]*aria-live="off"/)
  })

  it('keeps execution visible when there are no pending model requests', () => {
    operation = generationProgress.start('edit')
    operation.report('execution', { attempt: 2, repairAttempt: 1 })
    const html = render()
    expect(html).toContain('Executing and validating generated code')
    expect(html).toContain('Repair requests: 1 (included above)')
    expect(html).not.toContain('Waiting for')
    expect(html).not.toMatch(/success|complete/i)
  })

  it('labels a repair distinctly from a fresh model retry', () => {
    operation = generationProgress.start('convert')
    operation.report('repair', { attempt: 3, repairAttempt: 2 })
    expect(render()).toContain('Waiting for model repair response')
    expect(render()).toContain('Repair requests: 2 (included above)')
    operation.report('model', { attempt: 3, repairAttempt: 0 })
    expect(render()).toContain('Waiting for model response')
    expect(render()).not.toContain('Repair requests:')
  })

  it('clears its timer and status on abort and gives a new operation a fresh timer', () => {
    const controller = new AbortController()
    operation = generationProgress.start('edit', { signal: controller.signal })
    vi.advanceTimersByTime(6000)
    expect(render()).toContain('Elapsed 0:06')
    controller.abort()
    expect(render()).toBe('')
    expect(vi.getTimerCount()).toBe(0)
    operation = generationProgress.start('convert')
    expect(render()).toContain('Elapsed 0:00')
    operation.finish()
    expect(render()).toBe('')
  })

  it('uses transport and active-operation fallbacks without inventing an elapsed time', () => {
    expect(render()).toBe('')
    transport.snapshot = { pending: 1 }
    expect(render()).toContain('Waiting for the model')
    expect(render()).not.toContain('Elapsed')
    transport.snapshot = { pending: 0 }
    expect(render({ active: true })).toContain('Preparing asset...')
    expect(render({ active: true })).not.toContain('Elapsed')
  })

  it.each([
    ['edit', EditModal], ['convert', ConversionModal],
  ])('renders %s progress within the active dialog only', (task, Component) => {
    operation = generationProgress.start(task)
    operation.report('repair', { attempt: 2, repairAttempt: 1 })
    vi.advanceTimersByTime(4000)
    const html = renderToStaticMarkup(<Component isOpen loading />)
    expect(html).toMatch(/<dialog[^>]*>[\s\S]*Waiting for model repair response[\s\S]*Elapsed 0:04[\s\S]*Repair requests: 1[\s\S]*<\/dialog>/)
    expect(renderToStaticMarkup(<Component isOpen loading={false} />)).not.toContain('Elapsed')
    expect(renderToStaticMarkup(<Component isOpen={false} loading />)).toBe('')
  })

  it('does not show another operation’s stage or timer in a modal', () => {
    operation = generationProgress.start('creative')
    operation.report('execution')
    const html = renderToStaticMarkup(<EditModal isOpen loading />)
    expect(html).toContain('Preparing asset...')
    expect(html).not.toContain('Executing and validating')
    expect(html).not.toContain('Elapsed')
  })

  it('explains another request in plain language without exposing raw code or implying a critic rejection', () => {
    operation = generationProgress.start('creative')
    operation.report('repair', { attempt: 2, repairAttempt: 1, retryReason: 'Execution failed: <branch> is not defined' })
    const html = render()
    expect(html).toContain('Why another request?')
    expect(html).toContain('The generated code uses a value that was never defined.')
    expect(html).not.toContain('Execution failed:')
    expect(html).not.toContain('<branch>')
    expect(html).not.toMatch(/critic rejection/i)
  })
})
