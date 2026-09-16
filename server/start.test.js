import { afterEach, expect, it } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalServer } from './start.js'

const cleanup = []
afterEach(async () => { for (const run of cleanup.splice(0).reverse()) await run() })

it('serves only built assets and the same local API in production', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'threejs-static-test-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const root = path.join(directory, 'dist')
  await mkdir(root)
  await writeFile(path.join(root, 'index.html'), '<title>Asset generator</title>')
  await writeFile(path.join(directory, 'outside.txt'), 'not-public')
  const server = createLocalServer({ root, env: {} })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const origin = `http://127.0.0.1:${server.address().port}`
  expect(await (await fetch(origin)).text()).toContain('Asset generator')
  expect((await fetch(origin + '/%2e%2e%2foutside.txt')).status).toBe(404)
  expect((await fetch(origin + '/.env')).status).toBe(404)
  expect((await fetch(origin + '/', { method: 'POST' })).status).toBe(405)
  expect((await (await fetch(origin + '/api/health')).json()).status).toBe('ok')
  expect((await fetch(origin + '/api/session')).headers.get('set-cookie')).toContain('HttpOnly')
})
