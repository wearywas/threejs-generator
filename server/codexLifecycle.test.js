import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => ({ createApi: vi.fn(), createServer: vi.fn(), loadEnv: vi.fn(() => ({})) }))
vi.mock('./api.js', () => ({ createApi: fakes.createApi }))
vi.mock('node:http', () => ({ createServer: fakes.createServer }))
vi.mock('vite', () => ({ defineConfig: value => value, loadEnv: fakes.loadEnv }))
vi.mock('@vitejs/plugin-react', () => ({ default: () => ({ name: 'react-test' }) }))
vi.mock('./workerBundle.js', () => ({ assetWorkerPlugin: () => ({ name: 'worker-test' }) }))
import { createLocalServer } from './start.js'
import config from '../vite.config.js'

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

it.each(['production', 'development', 'preview'])('closes owned API resources and catches async sanitized teardown failure in %s', async mode => {
  const close = vi.fn().mockRejectedValue(new Error('private shutdown stderr'))
  const api = Object.assign(vi.fn(), { close })
  fakes.createApi.mockReturnValue(api)
  const httpServer = new EventEmitter()
  fakes.createServer.mockReturnValue(httpServer)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  if (mode === 'production') {
    expect(createLocalServer({ env: {} })).toBe(httpServer)
  } else {
    const plugin = config({ mode: 'test' }).plugins.find(item => item.name === 'local-model-api')
    const server = { httpServer, middlewares: { use: vi.fn() } }
    plugin[mode === 'development' ? 'configureServer' : 'configurePreviewServer'](server)
    expect(server.middlewares.use).toHaveBeenCalledWith(api)
  }
  httpServer.emit('close')
  await new Promise(resolve => setImmediate(resolve))
  expect(close).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledExactlyOnceWith('Codex shutdown failed; the owned connection may still be reserved.')
})
