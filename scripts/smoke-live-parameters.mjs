// Full workbench regression: rapid controls, no blank frames, saved final values.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const code = `function createAsset(THREE, seed, textures, params) {
  if (params.height > 4.9) { while (true) {} }
  if (params.width > 4.9) throw new Error('Width rejected by fixture')
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(params.width, params.height, 1), new THREE.MeshStandardMaterial({ color: '#55aacc' }))
  mesh.position.y = params.height / 2
  root.add(mesh)
  return { root }
}`
const record = { id: 'live-fixture', documentVersion: 1, mode: 'procedural', name: 'Live fixture', prompt: 'Live fixture', family: 'general', code,
  seed: 0, schema: { width: { type: 'number', min: 1, max: 5, default: 2, label: 'Width' }, height: { type: 'number', min: 1, max: 5, default: 2, label: 'Height' } },
  params: { width: 2, height: 2 }, textures: {}, textureSlots: [], tags: [], createdAt: 1 }
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/message', route => route.abort())
  await page.goto(process.argv[2] || 'http://127.0.0.1:5275')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'live.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 2, generations: [record] })) })
  await page.getByRole('button', { name: 'Load Live fixture', exact: true }).click()
  const width = page.getByRole('slider', { name: 'Width', exact: true })
  const height = page.getByRole('slider', { name: 'Height', exact: true })
  const canvas = page.getByLabel('Asset preview', { exact: true })
  await expect(width).toHaveValue('2')
  await expect.poll(() => canvas.evaluate(el => el.width)).toBeGreaterThan(300)
  const originalBox = await canvas.boundingBox()
  await page.evaluate(() => {
    window.liveCanvas = document.querySelector('canvas[aria-label="Asset preview"]')
    window.badFrames = 0
    window.monitor = true
    const probe = document.createElement('canvas')
    probe.width = probe.height = 1
    const context = probe.getContext('2d', { willReadFrequently: true })
    const check = () => {
      if (!window.monitor) return
      const current = document.querySelector('canvas[aria-label="Asset preview"]')
      context.drawImage(window.liveCanvas, 0, 0, 1, 1)
      if (current !== window.liveCanvas || context.getImageData(0, 0, 1, 1).data[3] === 0) window.badFrames++
      requestAnimationFrame(check)
    }
    check()
  })
  await width.fill('2.2')
  // Must stay usable during a rebuild, not just re-enable after it finishes.
  expect(await width.isEnabled()).toBe(true)
  expect(await height.isEnabled()).toBe(true)
  await height.fill('3')
  for (const value of ['2.6', '3', '3.4', '3.8', '4.2', '4.6']) await width.fill(value)
  await expect(width).toHaveValue('4.6')
  await expect(height).toHaveValue('3')
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
  expect(await canvas.boundingBox()).toEqual(originalBox)
  expect(await page.evaluate(() => window.badFrames)).toBe(0)

  await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
  await page.getByPlaceholder('Enter a name for this asset').fill('Live final')
  await page.getByRole('button', { name: 'Save to Library', exact: true }).last().click()
  const readRecords = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('threejs-generator-library', 2)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const request = db.transaction('generations').objectStore('generations').getAll()
      request.onsuccess = () => { resolve(request.result); db.close() }
    }
  }))
  await expect.poll(async () => (await readRecords()).length).toBe(2)
  expect((await readRecords()).find(item => item.name === 'Live final')).toMatchObject({ params: { width: 4.6, height: 3 }, seed: 0 })
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download GLB', exact: true }).click()
  const stream = await (await downloading).createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const glb = Buffer.concat(chunks)
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
  const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION]
  expect(position.max[0] - position.min[0]).toBeCloseTo(4.6, 5)
  expect(position.max[1] - position.min[1]).toBeCloseTo(3, 5)

  await width.fill('5')
  const fixtureError = page.getByRole('alert').filter({ hasText: 'Width rejected by fixture' })
  await expect(fixtureError).toBeVisible()
  await expect(width).toHaveValue('4.6')
  await expect(height).toHaveValue('3')
  expect(await canvas.evaluate(el => el === window.liveCanvas)).toBe(true)
  expect(await page.evaluate(() => window.badFrames)).toBe(0)
  await width.fill('4')
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
  await expect(fixtureError).toHaveCount(0)
  // A hanging candidate can be cancelled without stopping the working model.
  await height.fill('5')
  await width.fill('2')
  await page.getByRole('button', { name: 'Cancel parameter updates' }).click()
  await expect(width).toHaveValue('4')
  await expect(height).toHaveValue('3')
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
  expect(await canvas.evaluate(el => el === window.liveCanvas)).toBe(true)
  await width.fill('3')
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
  await expect(width).toHaveValue('3')
  await expect(page.locator('iframe[title="Isolated asset runtime"]')).toHaveCount(1)
  await page.evaluate(() => { window.monitor = false })
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
  expect(errors).toEqual([])
  console.log('Live parameters: uninterrupted controls/canvas, merged final inputs saved/exported, failed edits and hung-worker cancellation recover, no paid calls')
} finally { await browser.close() }
