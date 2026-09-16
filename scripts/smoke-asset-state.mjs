// Isolated browser profile and synthetic responses only; no paid model requests.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const code = `function createAsset(THREE, seed, textures, params) {
  const root = new THREE.Group()
  const geometry = new THREE.BoxGeometry(params.size || 1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ color: 0x55aacc })
  if (textures.wall) material.map = new THREE.TextureLoader().load(textures.wall)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set((seed % 7) / 10, 0.5, 0)
  root.add(mesh)
  return { root }
}`
// Real browser-encoded PNG; the previous hand-copied fixture had invalid image data.
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGD4DwAAAP//cGajQwAAAAZJREFUAwABDgEC81VxbAAAAABJRU5ErkJggg=='
const record = { id: 'state-fixture', documentVersion: 1, mode: 'procedural', name: 'State fixture', prompt: 'State fixture', family: 'general', code,
  seed: 0, schema: { size: { type: 'number', min: 1, max: 5, default: 1, label: 'Width' } }, params: { size: 3 },
  textures: { wall: `data:image/png;base64,${png}` }, textureSlots: [{ id: 'wall', label: 'Wall' }], tags: [], createdAt: 1, restorationNotes: [] }

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.route('**/api/message', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ code: 'incomplete_output', error: 'Synthetic model failure', retryable: false }) }))
  await page.goto(process.argv[2] || 'http://127.0.0.1:5275')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'state.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 2, generations: [record] })) })
  await page.getByRole('button', { name: 'Load State fixture', exact: true }).click()
  await expect(page.getByLabel('Asset seed')).toHaveText('0')
  await expect(page.getByRole('slider', { name: 'Width' })).toHaveValue('3')
  await expect(page.getByRole('img', { name: 'Wall texture', exact: true })).toBeVisible()
  await page.getByRole('slider', { name: 'Width' }).fill('4')
  await expect(page.getByRole('slider', { name: 'Width' })).toHaveValue('4')
  await expect(page.getByLabel('Asset seed')).toHaveText('0')

  // Unapplied and invalid drafts cannot replace the committed save/export source.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Asset code draft').fill('function createAsset(THREE) { throw new Error("bad draft") }')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Code draft not applied.', { exact: false })).toBeVisible()
  await page.getByRole('slider', { name: 'Width' }).fill('3.4')
  await expect(page.getByText('Code draft not applied.', { exact: false })).toBeVisible()
  await page.getByRole('slider', { name: 'Width' }).fill('4')
  await page.getByRole('button', { name: 'Re-run', exact: true }).click()
  await expect(page.getByText('Execution failed: bad draft', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Asset seed')).toHaveText('0')

  // Browsing templates must not relabel or replace the current document.
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
  await page.getByPlaceholder('Enter a name for this asset').fill('Round trip state')
  await page.getByRole('button', { name: 'Save to Library', exact: true }).last().click()
  const readRecords = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('threejs-generator-library', 2)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const request = db.transaction('generations').objectStore('generations').getAll()
      request.onsuccess = () => { resolve(request.result); db.close() }
      request.onerror = () => { reject(request.error); db.close() }
    }
  }))
  await expect.poll(async () => (await readRecords()).length).toBe(2)
  const saved = (await readRecords()).find(item => item.name === 'Round trip state')
  expect(saved).toMatchObject({ documentVersion: 1, mode: 'procedural', seed: 0, params: { size: 4 }, textures: record.textures, code })
  expect(saved.thumbnail).toMatch(/^data:image\/png/)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Load Round trip state', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Width' })).toHaveValue('4')
  await expect(page.getByLabel('Asset seed')).toHaveText('0')
  await expect(page.getByRole('img', { name: 'Wall texture', exact: true })).toBeVisible()

  const glbDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download GLB', exact: true }).click()
  const glbStream = await (await glbDownload).createReadStream()
  const chunks = []
  for await (const chunk of glbStream) chunks.push(chunk)
  expect(Buffer.concat(chunks).subarray(0, 4).toString()).toBe('glTF')
  await page.getByRole('button', { name: /Prepare for Batching/ }).click()
  await expect(page.getByRole('heading', { name: 'Batching Preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Close batching preview' }).click()
  // Assert the actual UI transition; remote preview frames keep running and do
  // not require a whole-page network-idle condition to close a local modal.
  await expect(page.getByRole('heading', { name: 'Batching Preview' })).not.toBeVisible()

  // Texture replacement must preserve the seed and parameterized geometry.
  await page.getByLabel('Wall texture', { exact: true }).setInputFiles({ name: 'wall.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByRole('button', { name: 'Remove Wall texture' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Width' })).toHaveValue('4')
  await expect(page.getByLabel('Asset seed')).toHaveText('0')
  await page.getByRole('button', { name: 'Remove Wall texture' }).click()
  await expect(page.getByRole('img', { name: 'Wall texture', exact: true })).not.toBeVisible()

  // A provider failure leaves the same working document available to save.
  await page.getByTitle('Edit with AI').click()
  await page.getByLabel('What would you like to change?').fill('make it taller')
  await page.getByRole('button', { name: 'Apply Edit', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Generative Edit' }).getByRole('alert')).toContainText('Synthetic model failure')
  await expect(page.getByLabel('Asset seed')).toHaveText('0')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
  expect(pageErrors).toEqual([])
  console.log('Asset state: seed/params/texture round trip, drafts, failed replacement, template browsing, thumbnail, GLB, batching and reload passed')
} finally { await browser.close() }
