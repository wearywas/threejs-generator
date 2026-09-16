// Run with NODE_PATH pointing to Playwright and PLAYWRIGHT_CHANNEL=chrome.
// Owns only port 5285; never loads project configuration, app UI, or .env files.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'public/templates')
for (const key of Object.keys(process.env)) {
  if (/API_KEY|ANTHROPIC|OPENAI|GOOGLE|GEMINI/.test(key)) process.env[key] = ''
}
const server = await createServer({
  root, configFile: false, envFile: false,
  cacheDir: 'node_modules/.vite-template-previews',
  server: { host: '127.0.0.1', port: 5285, strictPort: true },
  optimizeDeps: { entries: [], include: ['three', 'zod', 'seedrandom'] },
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:5285' || url.pathname.startsWith('/api/')) return route.abort()
    if (url.pathname === '/__template-previews__') return route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' })
    return route.continue()
  })
  await page.goto('http://127.0.0.1:5285/__template-previews__', { waitUntil: 'networkidle' })
  const entries = await page.evaluate(async () => {
    const { builtinTemplates } = await import('/src/services/builtinTemplates.js')
    return builtinTemplates.map(({ id, name }) => ({ id, name }))
  })
  await mkdir(output, { recursive: true })
  for (const entry of entries) {
    const result = await page.evaluate(async id => {
      const THREE = await import('/node_modules/.vite-template-previews/deps/three.js')
      const { builtinTemplates } = await import('/src/services/builtinTemplates.js')
      const { createAsset } = await import('/src/runtime/AssetFactory.js')
      const entry = builtinTemplates.find(item => item.id === id)
      const asset = createAsset({ ...entry.document.spec, textures: entry.document.textures })
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
      try {
        renderer.setSize(640, 480)
        renderer.setPixelRatio(1)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        const scene = new THREE.Scene()
        scene.background = new THREE.Color('#25272b')
        scene.add(new THREE.HemisphereLight(0xffffff, 0x858585, 2))
        const key = new THREE.DirectionalLight(0xffffff, 3)
        key.position.set(5, 10, 8)
        scene.add(key)
        const fill = new THREE.DirectionalLight(0xffffff, 1)
        fill.position.set(-6, 4, -3)
        scene.add(fill, asset.root)
        // Same fixed animation step for every animated template; no geometry edits.
        asset.tick?.(1.5, 1 / 60)
        asset.root.traverse(object => object.geometry?.computeBoundingBox())
        const bounds = new THREE.Box3().setFromObject(asset.root)
        if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) throw new Error(`Invalid bounds: ${id}`)
        const center = bounds.getCenter(new THREE.Vector3())
        const radius = bounds.getSize(new THREE.Vector3()).length() / 2
        const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.01, radius * 30)
        camera.position.copy(center).add(new THREE.Vector3(1, 0.65, 1.25).normalize().multiplyScalar(radius * 4))
        camera.lookAt(center)
        camera.updateMatrixWorld()
        // Fit projected bounds to a consistent margin, including low/wide assets.
        const corners = []
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z))
        for (let step = 0; step < 12; step++) {
          const extent = Math.max(...corners.flatMap(point => { const p = point.clone().project(camera); return [Math.abs(p.x), Math.abs(p.y)] }))
          camera.position.sub(center).multiplyScalar(extent / 0.82).add(center)
          camera.updateMatrixWorld()
        }
        renderer.render(scene, camera)
        return { png: renderer.domElement.toDataURL('image/png'), calls: renderer.info.render.calls, bounds: [bounds.min.toArray(), bounds.max.toArray()] }
      } finally {
        asset.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
      }
    }, entry.id)
    if (!result.calls) throw new Error(`No draw calls: ${entry.id}`)
    await writeFile(path.join(output, `${entry.id}.png`), Buffer.from(result.png.split(',')[1], 'base64'))
    console.log(`${entry.id}: 640x480 PNG, ${result.calls} draw calls`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('Seven previews rendered successfully; isolated browser and port 5285 closing.')
} finally {
  await browser?.close()
  await server.close()
}
