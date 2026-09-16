// Exercise real isolated rendering; no provider requests or user browser data.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const cacheDir = process.env.VITE_TEST_CACHE_DIR || '.vite'
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', route => route.abort())
  await page.route('**/__live-preview__', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script></body></html>' }))
  await page.goto((process.argv[2] || 'http://127.0.0.1:5275') + '/__live-preview__')
  await page.evaluate(async cacheDir => {
    const React = (await import(`/node_modules/${cacheDir}/deps/react.js`)).default
    const { createRoot } = (await import(`/node_modules/${cacheDir}/deps/react-dom_client.js`)).default
    const { default: Preview } = await import('/src/components/IsolatedPreviewCanvas.jsx')
    const { executeCode } = await import('/src/runtime/CodeSandbox.js')
    const { ownAsset } = await import('/src/runtime/assetWorkspace.js')
    await import('/src/index.css')
    const root = createRoot(document.getElementById('root'))
    const code = `function createAsset(THREE, seed, textures, params) {
      const root = new THREE.Group()
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(params.width, 2, 2), new THREE.MeshStandardMaterial({ color: params.color }))
      mesh.position.y = 1
      root.add(mesh)
      return { root }
    }`
    window.assets = []
    window.cameraMessages = []
    window.showAsset = async (width, color, continuityKey = 'fixture') => {
      const asset = ownAsset(await executeCode(code, { seed: 42, params: { width, color } }))
      const setCamera = asset.setCamera
      const attachView = asset.attachView
      asset.setCamera = (id, camera) => { window.cameraMessages.push({ width, camera }); return setCamera(id, camera) }
      asset.attachView = (id, canvas, config, ...rest) => { window.cameraMessages.push({ width, camera: config.camera }); return attachView(id, canvas, config, ...rest) }
      window.assets.push(asset)
      root.render(React.createElement('div', { style: { width: '1000px', height: '700px' } }, React.createElement(Preview, { asset, continuityKey })))
    }
    await window.showAsset(2, '#cc7755')
  }, cacheDir)
  const canvas = page.getByLabel('Asset preview', { exact: true })
  await expect(canvas).toBeVisible()
  await expect.poll(() => canvas.evaluate(el => el.width)).toBe(1000)
  await page.evaluate(() => { window.originalCanvas = document.querySelector('canvas') })
  // Change orbit and zoom, then wait for damping to settle before replacement.
  await canvas.hover()
  await page.mouse.move(500, 300)
  await page.mouse.down()
  await page.mouse.move(700, 370, { steps: 12 })
  await page.mouse.up()
  await page.mouse.wheel(0, -150)
  await expect.poll(() => page.evaluate(() => window.cameraMessages.filter(item => item.camera).length)).toBeGreaterThan(3)
  await expect.poll(async () => {
    const prior = await page.evaluate(() => window.cameraMessages.filter(item => item.camera).at(-1).camera.position)
    await page.waitForTimeout(150)
    const next = await page.evaluate(() => window.cameraMessages.filter(item => item.camera).at(-1).camera.position)
    return Math.max(...prior.map((value, index) => Math.abs(value - next[index])))
  }, { timeout: 15000 }).toBeLessThan(0.001)
  const before = await page.evaluate(() => window.cameraMessages.filter(item => item.camera).at(-1).camera)
  await page.evaluate(() => {
    window.missingCanvasFrames = 0
    window.blankFrames = 0
    window.originalImage = window.originalCanvas.toDataURL()
    const probe = document.createElement('canvas')
    probe.width = probe.height = 1
    const context = probe.getContext('2d', { willReadFrequently: true })
    window.monitor = true
    const check = () => {
      if (!window.monitor) return
      if (document.querySelector('canvas') !== window.originalCanvas) window.missingCanvasFrames++
      context.drawImage(window.originalCanvas, 0, 0, 1, 1)
      if (context.getImageData(0, 0, 1, 1).data[3] === 0) window.blankFrames++
      requestAnimationFrame(check)
    }
    check()
  })
  await page.evaluate(() => window.showAsset(5, '#55aacc'))
  await expect.poll(() => page.evaluate(() => window.cameraMessages.filter(item => item.width === 5 && item.camera).length)).toBeGreaterThan(0)
  const after = await page.evaluate(() => window.cameraMessages.find(item => item.width === 5 && item.camera).camera)
  expect(await canvas.evaluate(el => el === window.originalCanvas)).toBe(true)
  expect(await page.evaluate(() => window.missingCanvasFrames)).toBe(0)
  for (const key of ['position', 'target']) for (let i = 0; i < 3; i++) expect(after[key][i]).toBeCloseTo(before[key][i], 1)
  await expect.poll(() => canvas.evaluate(el => el.toDataURL() !== window.originalImage)).toBe(true)
  expect(await page.evaluate(() => window.blankFrames)).toBe(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Smaller parameter bounds must not clamp an existing, far-away camera.
  await page.evaluate(() => window.showAsset(200, '#55aacc', 'large-fixture'))
  await expect.poll(() => page.evaluate(() => window.cameraMessages.filter(item => item.width === 200 && item.camera).length)).toBeGreaterThan(0)
  const largeCamera = await page.evaluate(() => window.cameraMessages.find(item => item.width === 200 && item.camera).camera)
  expect(Math.hypot(...largeCamera.position.map((value, i) => value - largeCamera.target[i]))).toBeGreaterThan(50)
  await page.evaluate(() => { window.cameraMessages = []; return window.showAsset(2, '#55aacc', 'large-fixture') })
  await expect.poll(() => page.evaluate(() => window.cameraMessages.filter(item => item.width === 2 && item.camera).length)).toBeGreaterThan(0)
  const smallCamera = await page.evaluate(() => window.cameraMessages.find(item => item.width === 2 && item.camera).camera)
  const distance = camera => Math.hypot(...camera.position.map((value, i) => value - camera.target[i]))
  expect(distance(smallCamera)).toBeCloseTo(distance(largeCamera), 4)
  await page.evaluate(() => { document.getElementById('root').firstElementChild.style.width = '200px' })
  await expect.poll(() => canvas.evaluate(el => el.width)).toBe(200)
  await page.waitForTimeout(150)
  const resizedCamera = await page.evaluate(() => window.cameraMessages.filter(item => item.width === 2 && item.camera).at(-1).camera)
  expect(distance(resizedCamera)).toBeGreaterThan(distance(smallCamera))
  await page.evaluate(() => { document.getElementById('root').firstElementChild.style.width = '1000px' })
  await expect.poll(() => canvas.evaluate(el => el.width)).toBe(1000)

  // Switch identities immediately after a large pan: old damping must not move
  // the new model off-center. The small model's true center is [0, 1, 0].
  await page.mouse.move(500, 300)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(850, 500, { steps: 1 })
  await page.mouse.up({ button: 'right' })
  await page.evaluate(() => { window.cameraMessages = []; return window.showAsset(3, '#cc7755', 'new-identity') })
  await expect.poll(() => page.evaluate(() => window.cameraMessages.filter(item => item.width === 3 && item.camera).length)).toBeGreaterThan(0)
  const centered = await page.evaluate(() => window.cameraMessages.find(item => item.width === 3 && item.camera).camera.target)
  centered.forEach((value, i) => expect(value).toBeCloseTo([0, 1, 0][i], 5))

  // Check the actual bitmap receiver honors a synchronously closed presentation
  // gate, even while asynchronous detach/worker cleanup has not happened yet.
  const blockedWidth = await page.evaluate(async () => {
    const { executeCode } = await import('/src/runtime/CodeSandbox.js')
    window.gatedAsset = await executeCode('function createAsset(THREE) { return { root: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()) } }')
    window.gatedCanvas = document.createElement('canvas')
    window.allowFrame = false
    await window.gatedAsset.attachView('gate', window.gatedCanvas, { width: 96, height: 96 }, { shouldPresent: () => window.allowFrame })
    return window.gatedCanvas.width
  })
  expect(blockedWidth).toBe(300)
  await page.evaluate(() => { window.allowFrame = true })
  await expect.poll(() => page.evaluate(() => window.gatedCanvas.width)).toBe(96)
  await page.evaluate(() => window.gatedAsset.dispose())
  await page.evaluate(() => { window.monitor = false; window.assets.forEach(asset => asset.dispose()) })
  expect(errors).toEqual([])
  console.log('Live preview: persistent canvas and orbit/zoom preserved across a real isolated asset rebuild')
} finally { await browser.close() }
