// Real browser isolation checks. Synthetic code only; no paid provider calls.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  ...(process.env.PLAYWRIGHT_SOFTWARE_GL ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const outbound = []
  page.on('console', message => { if (message.text().startsWith('[isolation]')) console.log(message.text()) })
  await page.route('**/api/message', route => route.abort())
  await page.route('**/isolation-probe*', route => { outbound.push(route.request().url()); return route.abort() })
  await page.route('**/__isolation__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolation checks</title><body></body>' }))
  await page.goto((process.argv[2] || 'http://127.0.0.1:5275') + '/__isolation__')
  await page.waitForLoadState('networkidle')
  const result = await page.evaluate(async () => {
    const { executeCode } = await import('/src/runtime/CodeSandbox.js')
    const results = []
    let ticks = 0
    const hostClock = setInterval(() => { ticks++ }, 10)
    const cube = `const root = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshStandardMaterial({color: 0x55aacc})); return {root};`
    const check = (condition, message) => { if (!condition) throw new Error(message); results.push(message); console.log('[isolation]', message) }
    const expectFailure = async (code, pattern, options = {}) => {
      try { const asset = await executeCode(code, options); asset.dispose(); throw new Error('Unexpected success') }
      catch (error) { check(pattern.test(error.message), `Rejected: ${error.message}`) }
    }
    try {
      const start = ticks
      await expectFailure('function createAsset() { while(true) {} }', /timed out/, { timeout: 350 })
      check(ticks > start + 5, 'Host remains responsive during an infinite factory loop')
      const controller = new AbortController()
      const aborted = executeCode('function createAsset() { while(true) {} }', { signal: controller.signal })
      setTimeout(() => controller.abort(), 100)
      await aborted.then(() => { throw new Error('Abort did not reject') }, error => check(error.name === 'AbortError', 'Aborting initialization terminates execution'))
      localStorage.setItem('isolation-test-marker', 'private-host-value')
      const secure = await executeCode(`function createAsset(THREE) {
        const global = (() => {}).constructor('return globalThis')();
        if (typeof global.document !== 'undefined' || typeof global.parent !== 'undefined') throw new Error('DOM escaped');
        if (typeof global['local' + 'Storage'] !== 'undefined') throw new Error('Storage escaped');
        let denied = false;
        try { global['indexed' + 'DB'].open('threejs-generator-library'); } catch (e) { denied = e.name === 'SecurityError'; }
        if (!denied) throw new Error('IndexedDB was not denied by opaque origin');
        if (global['fe' + 'tch'] || global['Wor' + 'ker']) throw new Error('Unexpected ambient capability');
        ${cube}
      }`)
      check(secure.isIsolated && secure.root === undefined && secure.triangleCount === 12, 'Opaque worker returns metadata, never live objects')
      secure.dispose()
      await expectFailure(`function createAsset(THREE) { new THREE.TextureLoader().load('${location.origin}/isolation-probe.png'); ${cube} }`, /supplied texture/)
      // Dynamic import is deliberately split so the early diagnostic regex does
      // not match; this exercises inherited CSP, not the source blocklist.
      const csp = await executeCode(`function createAsset(THREE) {
        (() => {}).constructor("return im" + "port('${location.origin}/isolation-probe.js')")().catch(() => {});
        ${cube}
      }`)
      await new Promise(resolve => setTimeout(resolve, 250))
      csp.dispose()
      console.log('[isolation] Starting textured fixture')
      const fixtureCanvas = document.createElement('canvas')
      fixtureCanvas.width = 8; fixtureCanvas.height = 8
      fixtureCanvas.getContext('2d').fillRect(0, 0, 8, 8)
      const asset = await executeCode(`function createAsset(THREE, seed, textures, params, addons) {
        const procedural = addons.textures.createCanvasTexture(32, 32, ctx => { ctx.fillStyle = 'red'; ctx.fillRect(0,0,32,32); });
        const root = new THREE.Group();
        root.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,3), new THREE.MeshStandardMaterial({map: procedural})));
        const uploaded = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({map: new THREE.TextureLoader().load(textures.wall)}));
        uploaded.position.x = 2; root.add(uploaded);
        return {root, update(time) { root.rotation.y = time * 0.1; }};
      }`, { seed: 0, textures: { wall: fixtureCanvas.toDataURL() } })
      const canvas = document.createElement('canvas')
      console.log('[isolation] Attaching textured fixture')
      document.body.appendChild(canvas)
      await asset.attachView('primary', canvas, { width: 640, height: 480, pixelRatio: 1 })
      await asset.setCamera('primary', { position: [7, 5, 8], target: [0, 0, 0] })
      console.log('[isolation] Capturing textured fixture')
      const thumbnail = await asset.captureThumbnail()
      check(thumbnail.startsWith('data:image/png;base64,') && thumbnail.length > 2000, 'Worker renders procedural/uploaded textures and captures a thumbnail')
      const glb = await asset.exportGLB()
      check(new DataView(glb).getUint32(0, true) === 0x46546c67, 'Worker exports a binary GLB')
      const spec = await asset.analyze({ name: 'isolated-fixture' })
      check(spec.meshes.length > 0 && spec.source.seed === 0, 'Instance analysis runs inside the worker with the saved seed')
      const batchCanvas = document.createElement('canvas')
      document.body.appendChild(batchCanvas)
      await asset.attachView('batch', batchCanvas, { width: 640, height: 480, pixelRatio: 1, batch: { gridSize: 2, spacing: 4, rotationJitter: 0.3, scaleJitter: 0.2 } })
      await asset.detachView('batch')
      await asset.detachView('primary')
      asset.dispose(); canvas.remove(); batchCanvas.remove()
      check(true, 'Batch variants and view cleanup stay inside the worker')
      const animation = await executeCode(`function createAsset(THREE) { const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); return { root, update() { while(true) {} } }; }`)
      const frozenCanvas = document.createElement('canvas')
      document.body.appendChild(frozenCanvas)
      const stopped = new Promise(resolve => animation.onError(resolve))
      const before = ticks
      await animation.attachView('loop', frozenCanvas, { width: 100, height: 100, pixelRatio: 1 }).catch(() => {})
      const error = await Promise.race([stopped, new Promise((_, reject) => setTimeout(() => reject(new Error('Animation watchdog failed')), 10000))])
      check(/timed out/.test(error.message) && ticks > before + 20, 'Infinite animation is terminated without freezing the host')
      animation.dispose(); frozenCanvas.remove()
      check(document.querySelectorAll('iframe[title="Isolated asset runtime"]').length === 0, 'All runtime brokers are removed')
      return results
    } finally { clearInterval(hostClock); localStorage.removeItem('isolation-test-marker') }
  })
  expect(outbound).toEqual([])
  await expect.poll(() => page.workers().length).toBe(0)
  const workerModuleLoadedInHost = await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /\/src\/runtime\/isolated\/(worker|factory|views)\.js/.test(entry.name)))
  expect(workerModuleLoadedInHost).toBe(false)
  console.log(JSON.stringify({ passed: result, forbiddenNetworkRequests: outbound.length }, null, 2))
} finally { await browser.close() }
