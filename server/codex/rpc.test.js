import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCodexRpc, probeCodexVersion } from './rpc.js'

const children = []
function fakeChild({ autoExit = true } = {}) {
  const child = new EventEmitter()
  children.push(child)
  child.pid = 12345
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn(() => { if (autoExit) child.emit('exit', null, 'SIGKILL'); return true })
  const sent = []
  child.stdin.on('data', data => sent.push(JSON.parse(data.toString())))
  child.send = data => child.stdout.write(`${JSON.stringify(data)}\n`)
  return { child, sent }
}

const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const owned = []
function setup(options) {
  const fake = fakeChild(options)
  const spawnProcess = vi.fn(() => fake.child)
  const rpc = createCodexRpc({ spawnProcess, executable: 'C:/trusted/codex.exe', cwd: 'C:/empty', env: { SystemRoot: 'C:/Windows' } })
  owned.push(rpc)
  return { ...fake, spawnProcess, rpc }
}
async function ready(ctx) {
  await tick()
  expect(ctx.sent[0].method).toBe('initialize')
  ctx.child.send({ id: ctx.sent[0].id, result: { userAgent: 'codex/test' } })
  await tick()
}

afterEach(async () => {
  children.splice(0).forEach(child => child.emit('exit', 0))
  await Promise.all(owned.splice(0).map(rpc => rpc.close()))
  vi.useRealTimers()
})

describe('private Codex RPC', () => {
  it('makes close await actual child exit rather than successful kill dispatch', async () => {
    vi.useFakeTimers()
    const ctx = setup({ autoExit: false })
    await ready(ctx)
    const exited = vi.fn()
    ctx.rpc.onNotification('transport/exited', exited)
    let settled = false
    const closing = ctx.rpc.close()
    expect(closing).toBeInstanceOf(Promise)
    closing.then(() => { settled = true })
    await tick()
    expect(settled).toBe(false)
    expect(exited).not.toHaveBeenCalled()
    ctx.child.emit('exit', null, 'SIGKILL')
    await closing
    expect(exited).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['false', 'throw'])('surfaces failed termination (%s), retains exit tracking, and permits an explicit retry', async behavior => {
    const ctx = setup({ autoExit: false })
    await ready(ctx)
    ctx.child.kill.mockImplementationOnce(() => { if (behavior === 'throw') throw new Error('raw termination details'); return false })
    const error = await Promise.resolve().then(() => ctx.rpc.close()).catch(error => error)
    expect(error).toMatchObject({ code: 'codex_shutdown_failed', retryable: false })
    expect(error.message).not.toContain('raw termination details')
    const retry = ctx.rpc.close()
    expect(ctx.child.kill).toHaveBeenCalledTimes(2)
    ctx.child.emit('exit', 0)
    await retry
  })

  it('bounds a missing exit acknowledgement to five seconds without claiming the child exited', async () => {
    vi.useFakeTimers()
    const ctx = setup({ autoExit: false })
    await ready(ctx)
    const exited = vi.fn()
    ctx.rpc.onNotification('transport/exited', exited)
    const closing = Promise.resolve().then(() => ctx.rpc.close()).catch(error => error)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await closing).toMatchObject({ code: 'codex_shutdown_failed' })
    expect(exited).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    ctx.child.emit('exit', 0)
    expect(exited).toHaveBeenCalledTimes(1)
  })
  it('initializes before requests, then notifies initialized, using private shell-free stdio', async () => {
    const ctx = setup()
    const result = ctx.rpc.request('account/read', { refreshToken: true })
    await ready(ctx)
    expect(ctx.sent.map(message => message.method)).toEqual(['initialize', 'initialized', 'account/read'])
    expect(ctx.spawnProcess).toHaveBeenCalledWith('C:/trusted/codex.exe', expect.arrayContaining(['app-server', '--listen', 'stdio://']), {
      cwd: 'C:/empty', env: { SystemRoot: 'C:/Windows' }, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
    })
    expect(Object.keys(ctx.rpc).sort()).toEqual(['close', 'onNotification', 'request'])
    ctx.child.send({ id: ctx.sent[2].id, result: { account: null } })
    await expect(result).resolves.toEqual({ account: null })
  })

  it('matches out-of-order replies by exact request ID, never by arrival order', async () => {
    const ctx = setup()
    await ready(ctx)
    const one = ctx.rpc.request('account/read', {})
    const two = ctx.rpc.request('model/list', {})
    await tick()
    const [a, b] = ctx.sent.slice(-2)
    ctx.child.send({ id: b.id, result: { data: [] } })
    ctx.child.send({ id: a.id, result: { account: null } })
    await expect(two).resolves.toEqual({ data: [] })
    await expect(one).resolves.toEqual({ account: null })
  })

  it('rejects non-allowlisted client methods and notification hooks', async () => {
    const ctx = setup()
    await ready(ctx)
    await expect(ctx.rpc.request('command/exec', {})).rejects.toMatchObject({ code: 'invalid_request', retryable: false })
    expect(() => ctx.rpc.onNotification('rawResponseItem/completed', () => {})).toThrow()
    expect(ctx.sent.some(message => message.method === 'command/exec')).toBe(false)
  })

  it('rejects every server request with a safe error and terminates the owned connection', async () => {
    const ctx = setup()
    await ready(ctx)
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    await tick()
    const listener = vi.fn()
    ctx.rpc.onNotification('transport/closed', listener)
    ctx.child.send({ id: 'server-1', method: 'item/commandExecution/requestApproval', params: { secret: 'never expose' } })
    expect(ctx.sent.at(-1)).toEqual({ id: 'server-1', error: { code: -32601, message: 'Unsupported server request.' } })
    expect(await result).toMatchObject({ code: 'codex_policy', retryable: false })
    expect(ctx.child.kill).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(listener.mock.calls)).not.toContain('never expose')
  })

  it.each(['not json\n', '[1,2]\n', '{"id":999,"result":{}}\n', '{"method":3}\n'])('fails closed on malformed or unmatched protocol %s', async wire => {
    const ctx = setup()
    await ready(ctx)
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    await tick()
    ctx.child.stdout.write(wire)
    expect(await result).toMatchObject({ code: 'invalid_response' })
    expect(ctx.child.kill).toHaveBeenCalledTimes(1)
  })

  it('bounds unterminated lines by UTF-8 bytes, including split chunks', async () => {
    const ctx = setup()
    await ready(ctx)
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    await tick()
    ctx.child.stdout.write(Buffer.alloc(8388608, 32))
    expect(ctx.child.kill).not.toHaveBeenCalled()
    ctx.child.stdout.write('x')
    expect(await result).toMatchObject({ code: 'invalid_response' })
    expect(ctx.child.kill).toHaveBeenCalledTimes(1)
  })

  it('handles split UTF-8 JSON lines and only allowlisted notifications', async () => {
    const ctx = setup()
    await ready(ctx)
    const listener = vi.fn()
    const unsubscribe = ctx.rpc.onNotification('item/completed', listener)
    const line = Buffer.from('{"method":"item/completed","params":{"text":"é"}}\n')
    const split = line.indexOf(Buffer.from('é')) + 1
    ctx.child.stdout.write(line.subarray(0, split))
    ctx.child.stdout.write(line.subarray(split))
    expect(listener).toHaveBeenCalledWith({ text: 'é' })
    unsubscribe()
    ctx.child.send({ method: 'item/completed', params: {} })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('sanitizes provider protocol errors and child startup failures', async () => {
    const ctx = setup()
    await ready(ctx)
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    await tick()
    ctx.child.send({ id: ctx.sent.at(-1).id, error: { code: -1, message: 'credential secret' } })
    expect((await result).message).not.toContain('credential secret')
    const bad = createCodexRpc({ spawnProcess() { throw new Error('secret path') }, executable: 'C:/bad.exe' })
    owned.push(bad)
    await expect(bad.request('account/read', {})).rejects.toMatchObject({ code: 'connection_error' })
  })

  it('terminates the child when initialization is rejected', async () => {
    const ctx = setup()
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    ctx.child.send({ id: ctx.sent[0].id, error: { code: -1, message: 'private startup details' } })
    expect(await result).toMatchObject({ code: 'provider_error' })
    expect(ctx.child.kill).toHaveBeenCalledTimes(1)
    expect(ctx.sent.some(message => message.method === 'initialized')).toBe(false)
  })

  it('rejects startup and request deadlines at 30 seconds and clears owned timers', async () => {
    vi.useFakeTimers()
    const ctx = setup()
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    await vi.advanceTimersByTimeAsync(30000)
    expect(await result).toMatchObject({ code: 'provider_timeout' })
    expect(ctx.child.kill).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('also bounds a request made after a successful handshake', async () => {
    vi.useFakeTimers()
    const ctx = setup()
    await ready(ctx)
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    await tick()
    await vi.advanceTimersByTimeAsync(30000)
    expect(await result).toMatchObject({ code: 'provider_timeout' })
    expect(ctx.child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects pending requests on child exit and closes idempotently', async () => {
    const ctx = setup()
    await ready(ctx)
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    await tick()
    ctx.child.emit('exit', 1)
    expect(await result).toMatchObject({ code: 'connection_error' })
    ctx.rpc.close()
    ctx.rpc.close()
    expect(ctx.child.kill).not.toHaveBeenCalled()
    await expect(ctx.rpc.request('account/read', {})).rejects.toMatchObject({ code: 'connection_error' })
  })

  it('kills only its own child on explicit close and removes timers', async () => {
    vi.useFakeTimers()
    const ctx = setup()
    const result = ctx.rpc.request('account/read', {}).catch(error => error)
    ctx.rpc.close()
    ctx.rpc.close()
    expect(await result).toMatchObject({ code: 'connection_error' })
    expect(ctx.child.kill).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('owned version probe', () => {
  it('waits for a cancelled version probe to exit and exposes a bounded retryable shutdown handle', async () => {
    vi.useFakeTimers()
    const { child } = fakeChild({ autoExit: false })
    const controller = new AbortController()
    const onExit = vi.fn()
    let stop
    let settled = false
    const probe = probeCodexVersion({ executable: 'C:/trusted/codex.exe', spawnProcess: () => child,
      signal: controller.signal, onExit, onShutdown: close => { stop = close } }).catch(error => { settled = true; return error })
    controller.abort()
    await tick()
    expect(settled).toBe(false)
    expect(typeof stop).toBe('function')
    expect(onExit).not.toHaveBeenCalled()
    child.emit('exit', 0)
    expect(await probe).toMatchObject({ code: 'cancelled' })
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains version-probe exit tracking after a failed kill and permits owned retry', async () => {
    const { child } = fakeChild({ autoExit: false })
    child.kill.mockReturnValueOnce(false)
    const controller = new AbortController()
    const onExit = vi.fn()
    let stop
    const probe = probeCodexVersion({ executable: 'C:/trusted/codex.exe', spawnProcess: () => child,
      signal: controller.signal, onExit, onShutdown: close => { stop = close } }).catch(error => error)
    controller.abort()
    expect(await probe).toMatchObject({ code: 'codex_shutdown_failed' })
    expect(onExit).not.toHaveBeenCalled()
    const retry = stop()
    child.emit('exit', 0)
    await retry
    expect(onExit).toHaveBeenCalledTimes(1)
  })
  it('accepts only bounded exact version output, without a shell', async () => {
    const { child } = fakeChild()
    const spawnProcess = vi.fn(() => child)
    const result = probeCodexVersion({ executable: 'C:/trusted/codex.exe', cwd: 'C:/empty', env: {}, spawnProcess })
    child.stdout.write('codex-cli 0.155.0-alpha.2.6\n')
    child.emit('close', 0)
    await expect(result).resolves.toBe('0.155.0-alpha.2.6')
    expect(spawnProcess).toHaveBeenCalledWith('C:/trusted/codex.exe', ['--version'], expect.objectContaining({ shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }))
  })

  it('terminates a hung version probe on close cancellation or its deadline', async () => {
    vi.useFakeTimers()
    for (const cancel of [false, true]) {
      const { child } = fakeChild()
      const controller = new AbortController()
      const result = probeCodexVersion({ executable: 'C:/trusted/codex.exe', spawnProcess: () => child, signal: controller.signal }).catch(error => error)
      if (cancel) controller.abort()
      else await vi.advanceTimersByTimeAsync(30000)
      expect((await result).code).toBe(cancel ? 'cancelled' : 'provider_timeout')
      expect(child.kill).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    }
  })
})
