// Build and serve the real app without loading .env or using the user's dist/.
// This process belongs only to Playwright; never point the suite at a live app.
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { build } from 'vite'
import config from '../../vite.config.js'
import { createLocalServer } from '../../server/start.js'
import { validateBuildDirectory } from './cleanup.mjs'

const directory = validateBuildDirectory(process.env.THREEJS_BROWSER_TEST_DIR)
await mkdir(directory)
let server
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  if (server?.listening) {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  // Startup errors and graceful stops clean up here; runner teardown also owns
  // cleanup because Playwright force-kills the server process tree on Windows.
  await rm(directory, { recursive: true, force: true })
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void stop().then(() => process.exit()) })
try {
  const options = config({ command: 'build', mode: 'test' })
  const root = path.join(directory, 'dist')
  await build({ ...options, configFile: false, envDir: false, build: { ...options.build, outDir: root, emptyOutDir: true } })
  // Defense in depth: even a test that submits a synthetic key cannot call a
  // provider if its browser interception is accidentally omitted.
  globalThis.fetch = async () => { throw new Error('Outbound network is disabled in the browser test server.') }
  server = createLocalServer({ root, env: {} })
  server.listen(5198, '127.0.0.1')
  await once(server, 'listening')
  console.log('No-key browser test server ready on http://127.0.0.1:5198')
} catch (error) {
  await stop()
  throw error
}
