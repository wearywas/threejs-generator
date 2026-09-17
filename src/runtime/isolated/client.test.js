import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeIsolated } from './client.js'

vi.mock('virtual:asset-worker-source', () => ({ default: 'bundled trusted runtime' }))

const code = 'function createAsset() { return {} }'
const metadata = {
  isProcedural: false, usesAddons: false, usedAddons: [], hasAnimation: false, triangleCount: 12,
  runtimeSignals: { bounds: { min: [0, 0, 0], max: [1, 1, 1], size: [1, 1, 1] }, meshCount: 1, instancedMeshCount: 0, materialCount: 1 },
}

// Simulate browser/worker startup while keeping the real host transport and its
// deadlines. The factory cannot receive init until the private port is ready.
function browser({ bootDelay = 6000, hangFactory = false, readyValue = null, detachDelay = 0 } = {}) {
  const sent = [], terminated = vi.fn(), removed = vi.fn(), listeners = new Map()
  vi.stubGlobal('OffscreenCanvas', class {})
  vi.stubGlobal('MessageChannel', class {
    constructor() {
      const a = { close: vi.fn() }, b = { close: vi.fn() }
      a.postMessage = value => queueMicrotask(() => b.onmessage?.({ data: value }))
      b.postMessage = value => queueMicrotask(() => a.onmessage?.({ data: value }))
      this.port1 = a; this.port2 = b
    }
  })
  const frame = { setAttribute() {}, remove: removed, contentWindow: {
    postMessage(_data, _target, [port, lifetime]) {
      lifetime.onmessage = terminated
      let ready = false
      const waiting = []
      const receive = message => {
        if (message.type === 'init' && hangFactory) return
        const reply = () => port.postMessage({ id: message.id, ok: true,
          value: message.type === 'ready' ? readyValue : message.type === 'init' ? metadata : null })
        if (message.type === 'detach') setTimeout(reply, detachDelay)
        else reply()
      }
      port.onmessage = ({ data }) => { sent.push(data.type); ready ? receive(data) : waiting.push(data) }
      setTimeout(() => { ready = true; waiting.splice(0).forEach(receive) }, bootDelay)
    },
  } }
  vi.stubGlobal('window', {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
  })
  vi.stubGlobal('document', {
    createElement: () => frame,
    body: { appendChild: () => queueMicrotask(() => listeners.get('message')?.({ source: frame.contentWindow, data: { type: 'asset-broker-ready' } })) },
  })
  return { sent, terminated, removed }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('isolated worker startup deadlines', () => {
  it('gives trusted worker bootstrap a separate deadline before executing generated code', async () => {
    const host = browser()
    const result = executeIsolated(code).catch(error => error)
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(5999)
    expect(host.sent).toEqual(['ready'])
    expect(host.terminated).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    const asset = await result
    expect(asset.triangleCount).toBe(12)
    expect(host.sent).toEqual(['ready', 'init'])
    asset.dispose()
  })

  it('still terminates a hung factory after its own five-second deadline', async () => {
    const host = browser({ hangFactory: true })
    const result = executeIsolated(code).catch(error => error)
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(10999)
    expect(host.terminated).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect((await result).message).toMatch(/Asset init timed out/)
    expect(host.terminated).toHaveBeenCalledTimes(1)
    expect(host.removed).toHaveBeenCalledTimes(1)
  })

  it('bounds startup and never sends generated code to an unresponsive worker', async () => {
    const host = browser({ bootDelay: 20000 })
    const result = executeIsolated(code).catch(error => error)
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(10000)
    expect((await result).message).toMatch(/Asset ready timed out/)
    expect(host.sent).toEqual(['ready'])
    expect(host.terminated).toHaveBeenCalledTimes(1)
  })

  it('validates startup acknowledgements before sending the factory', async () => {
    const host = browser({ bootDelay: 0, readyValue: { unexpected: true } })
    const result = executeIsolated(code).catch(error => error)
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(0)
    expect((await result).message).toMatch(/Invalid runtime acknowledgement/)
    expect(host.sent).toEqual(['ready'])
    expect(host.terminated).toHaveBeenCalledTimes(1)
  })

  it('allows bounded graphics resource cleanup without imposing the short heartbeat deadline', async () => {
    const host = browser({ bootDelay: 0, detachDelay: 6000 })
    const running = executeIsolated(code)
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(0)
    const asset = await running
    const cleanup = asset.detachView('batch').catch(error => error)
    await vi.advanceTimersByTimeAsync(6000)
    expect(await cleanup).toBeUndefined()
    expect(host.terminated).not.toHaveBeenCalled()
    asset.dispose()
  })

  it('still stops a stuck graphics cleanup after fifteen seconds', async () => {
    const host = browser({ bootDelay: 0, detachDelay: 20000 })
    const running = executeIsolated(code)
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(0)
    const asset = await running
    const cleanup = asset.detachView('batch').catch(error => error)
    await vi.advanceTimersByTimeAsync(14999)
    expect(host.terminated).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect((await cleanup).message).toMatch(/Asset detach timed out/)
    expect(host.terminated).toHaveBeenCalledTimes(1)
  })
})
