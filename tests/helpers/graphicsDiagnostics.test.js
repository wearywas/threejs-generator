import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { collectGraphicsDiagnostics } from './graphicsDiagnostics.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('does not reject the functional test when CDP is unavailable', async () => {
  await expect(collectGraphicsDiagnostics({
    newBrowserCDPSession: async () => { throw new Error('CDP unavailable') },
  }, {})).resolves.toBeUndefined()
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds a stalled diagnostic startup and releases a session that arrives late', async () => {
  let connect
  const attach = vi.fn(), detach = vi.fn(async () => {})
  let completed = false
  const pending = collectGraphicsDiagnostics({
    newBrowserCDPSession: () => new Promise(resolve => { connect = resolve }),
  }, { attach }).then(() => { completed = true })
  await vi.advanceTimersByTimeAsync(4999)
  expect(completed).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await pending
  expect(completed).toBe(true)
  connect({ detach })
  await vi.advanceTimersByTimeAsync(0)
  expect(detach).toHaveBeenCalledOnce()
  expect(attach).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('returns when CDP requests and detach are both unresponsive', async () => {
  const detach = vi.fn(() => new Promise(() => {}))
  const pending = collectGraphicsDiagnostics({
    newBrowserCDPSession: async () => ({ send: () => new Promise(() => {}), detach }),
  }, {})
  await vi.advanceTimersByTimeAsync(5000)
  await expect(pending).resolves.toBeUndefined()
  expect(detach).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
