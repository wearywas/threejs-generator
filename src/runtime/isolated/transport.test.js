import { describe, expect, it, vi } from 'vitest'
import { MessageChannel } from 'node:worker_threads'
import { createTransport } from './transport.js'

describe('runtime request ownership', () => {
  it.each(['glb', 'viewOptimization', 'attach', 'thumbnail', 'analyze'])('keeps %s deadlines bounded and rejects commands waiting behind a hung operation', async type => {
    vi.useFakeTimers()
    const sent = []
    const port = { postMessage: message => sent.push(message), close() {} }
    const rpc = createTransport(port, () => {})
    try {
      const exporting = rpc.request(type, {}, [], 30000)
      const waiting = rpc.request('detach')
      const results = Promise.allSettled([exporting, waiting])
      expect(rpc.busy).toBe(true)
      await vi.advanceTimersByTimeAsync(30001)
      expect((await results).every(result => result.status === 'rejected' && result.reason.message.includes(`${type} timed out`))).toBe(true)
      expect(sent.map(message => message.type)).toEqual([type])
      expect(rpc.busy).toBe(false)
    } finally { rpc.close(); vi.useRealTimers() }
  })

  it('releases queued work after a nonfatal export failure and still enforces the pending limit', async () => {
    const sent = []
    const port = { postMessage: message => sent.push(message), close() {} }
    const rpc = createTransport(port, () => {})
    const results = [rpc.request('viewGLB')]
    for (let i = 0; i < 31; i++) results.push(rpc.request('camera'))
    const all = Promise.allSettled(results)
    try {
      await expect(rpc.request('resize')).rejects.toThrow(/Too many/)
      port.onmessage({ data: { id: sent[0].id, ok: false, error: 'Export not supported' } })
      for (let i = 1; i < 32; i++) {
        expect(sent).toHaveLength(i + 1)
        port.onmessage({ data: { id: sent[i].id, ok: true, value: null } })
      }
      expect((await all).slice(1).every(result => result.status === 'fulfilled')).toBe(true)
      expect(rpc.busy).toBe(false)
    } finally { rpc.close() }
  })
  it.each(['attach', 'thumbnail', 'analyze'])('does not run a short heartbeat or camera deadline behind %s', async type => {
    vi.useFakeTimers()
    const sent = []
    const port = { postMessage: message => sent.push(message), close() {} }
    const terminate = vi.fn()
    const rpc = createTransport(port, terminate)
    try {
      const results = Promise.allSettled([
        rpc.request(type, {}, [], 15000), rpc.request('ping'), rpc.request('camera'),
      ])
      await vi.advanceTimersByTimeAsync(6000)
      expect(terminate).not.toHaveBeenCalled()
      expect(sent.map(message => message.type)).toEqual([type])
      for (let i = 0; i < 3; i++) {
        port.onmessage({ data: { id: sent[i].id, ok: true, value: null } })
      }
      expect((await results).every(result => result.status === 'fulfilled')).toBe(true)
      expect(rpc.busy).toBe(false)
    } finally { rpc.close(); vi.useRealTimers() }
  })
  it('finishes an already dispatched heartbeat before starting a long operation', async () => {
    const sent = []
    const port = { postMessage: message => sent.push(message), close() {} }
    const rpc = createTransport(port, () => {})
    const results = Promise.allSettled([rpc.request('ping'), rpc.request('attach', {}, [], 15000)])
    try {
      expect(sent.map(message => message.type)).toEqual(['ping'])
      port.onmessage({ data: { id: sent[0].id, ok: true, value: null } })
      expect(sent.map(message => message.type)).toEqual(['ping', 'attach'])
      port.onmessage({ data: { id: sent[1].id, ok: true, value: null } })
      expect((await results).every(result => result.status === 'fulfilled')).toBe(true)
    } finally { rpc.close() }
  })
  it.each(['camera', 'resize', 'detach', 'attach', 'thumbnail', 'analyze'])('starts the %s deadline after an in-flight export, without stopping the asset', async type => {
    vi.useFakeTimers()
    const sent = []
    const port = { postMessage: message => sent.push(message), close() {} }
    let terminated = false
    const rpc = createTransport(port, () => { terminated = true })
    try {
      const exportResult = rpc.request('viewGLB', { id: 'grid' }, [], 30000)
      const command = rpc.request(type, { id: 'grid' }, [], 5000)
      const settled = Promise.all([exportResult, command]).catch(error => error)
      await vi.advanceTimersByTimeAsync(6000)
      expect(terminated).toBe(false)
      expect(sent.map(message => message.type)).toEqual(['viewGLB'])
      const first = sent[0]
      port.onmessage({ data: { id: first.id, ok: true, value: 'GLB' } })
      await Promise.resolve(); await Promise.resolve()
      expect(sent[1].type).toBe(type)
      port.onmessage({ data: { id: sent[1].id, ok: true, value: null } })
      expect(await settled).toEqual(['GLB', null])
      expect(terminated).toBe(false)
    } finally { rpc.close(); vi.useRealTimers() }
  })
  it('terminates an unresponsive runtime and rejects all pending work', async () => {
    const channel = new MessageChannel()
    let terminated = false
    const rpc = createTransport(channel.port1, () => { terminated = true; channel.port2.close() })
    const pending = rpc.request('init', {}, [], 20)
    await expect(pending).rejects.toThrow(/timed out/)
    expect(terminated).toBe(true)
    await expect(rpc.request('ping')).rejects.toThrow(/timed out/)
  })
  it('ignores unknown IDs and validates the reply belonging to its request', async () => {
    const channel = new MessageChannel()
    const rpc = createTransport(channel.port1, () => channel.port2.close())
    channel.port2.once('message', request => {
      channel.port2.postMessage({ id: request.id + 1, ok: true, value: 99 })
      channel.port2.postMessage({ id: request.id, ok: true, value: 12 })
    })
    expect(await rpc.request('stats', {}, [], 500, value => {
      if (value !== 12) throw new Error('Invalid count')
      return value
    })).toBe(12)
    rpc.close()
  })
  it('rejects a malformed response rather than exposing its value', async () => {
    const channel = new MessageChannel()
    const rpc = createTransport(channel.port1, () => channel.port2.close())
    const listener = vi.fn()
    rpc.onError(listener)
    channel.port2.once('message', request => channel.port2.postMessage({ id: request.id, ok: 'yes', value: '<html>' }))
    await expect(rpc.request('export')).rejects.toThrow(/response/)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
