// Mount the real modal and host camera; record the camera sent to the worker boundary.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 1000 } })
  await page.route('**/api/**', route => route.abort())
  await page.route('**/__camera-test__', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script></body></html>' }))
  await page.goto((process.argv[2] || 'http://127.0.0.1:5275') + '/__camera-test__')
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
    const { default: Modal } = await import('/src/components/Modal.jsx')
    const { default: Preview } = await import('/src/components/IsolatedPreviewCanvas.jsx')
    await import('/src/index.css')
    window.cameraRecord = null
    const asset = {
      runtimeSignals: { bounds: { min: [-6.75, 0, -5], max: [6.75, 5.2, 5] } },
      retain: () => () => {}, onError: () => () => {},
      attachView: async () => {}, detachView: async () => {}, resizeView: async () => {},
      setCamera: async (id, camera) => { window.cameraRecord = camera },
    }
    createRoot(document.getElementById('root')).render(React.createElement(Modal, { labelledBy: 'title', onClose: () => {}, className: 'batch-dialog w-[90vw] h-[85vh] max-w-6xl overflow-hidden' },
      React.createElement('h2', { id: 'title' }, 'Camera fixture'),
      React.createElement('div', { className: 'batch-dialog-body' },
        React.createElement('div', { className: 'batch-dialog-viewport' }, React.createElement(Preview, { asset, batch: { gridSize: 3, spacing: 22.2, rotationJitter: 0.3, scaleJitter: 0.2 } })),
        React.createElement('div', { className: 'batch-dialog-controls' }, 'Controls'))))
  })
  const occupancy = () => page.evaluate(async () => {
    if (!window.cameraRecord) return 99
    const { PerspectiveCamera, Vector3 } = await import('/node_modules/.vite/deps/three.js')
    const canvas = document.querySelector('canvas')
    const camera = new PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
    camera.position.fromArray(window.cameraRecord.position)
    camera.lookAt(new Vector3(...window.cameraRecord.target))
    camera.updateMatrixWorld()
    const points = []
    for (const x of [-32.28, 32.28]) for (const y of [0, 6.24]) for (const z of [-32.28, 32.28]) points.push(new Vector3(x, y, z).project(camera))
    return Math.max(...points.flatMap(point => [Math.abs(point.x), Math.abs(point.y)]))
  })
  await expect(page.getByRole('dialog', { name: 'Camera fixture' })).toBeVisible()
  await expect.poll(occupancy).toBeLessThan(0.95)
  await page.setViewportSize({ width: 780, height: 1200 })
  await expect.poll(occupancy).toBeLessThan(0.95)
  console.log('Modal camera fits visible canvas dimensions on opening and resize: passed')
} finally { await browser.close() }
