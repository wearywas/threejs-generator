// Real clipboard/download/import checks in a fresh profile; no paid requests.
import { createRequire } from 'node:module'
import * as THREE from 'three'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const url = process.argv[2] || 'http://127.0.0.1:5275'
const code = `function createAsset(THREE, seed, textures, params) {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(params.width || 1, 1, 1), new THREE.MeshStandardMaterial({ color: '#55aacc' }));
  mesh.position.set(seed % 7, 0.5, 0);
  root.add(mesh);
  return { root };
}`
const draft = 'function createAsset() { throw new Error("Unapplied draft") }'
const texture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGD4DwAAAP//cGajQwAAAAZJREFUAwABDgEC81VxbAAAAABJRU5ErkJggg=='
const record = { id: 'code-download-fixture', documentVersion: 1, mode: 'procedural', name: 'Download fixture', prompt: 'Download fixture', family: 'general', code,
  seed: 0, schema: { width: { type: 'number', min: 1, max: 5, default: 1, label: 'Width' } }, params: { width: 3 },
  textures: { wall: texture }, textureSlots: [{ id: 'wall', label: 'Wall' }], tags: [], createdAt: 1 }
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url })
  await context.route('**/api/message', route => route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 2, generations: [record] })) })
  await page.getByRole('button', { name: 'Load Download fixture', exact: true }).click()
  await page.getByRole('slider', { name: 'Width', exact: true }).fill('4')
  await expect(page.getByRole('button', { name: 'Download .js', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Copy source', exact: true }).click()
  // Windows clipboard normalizes line endings; source content must still match.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(code)

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Asset code draft').fill(draft)
  await page.getByRole('button', { name: 'Copy draft', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(draft)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Re-run', exact: true }).click()
  await expect(page.getByText('Execution failed: Unapplied draft', { exact: true })).toBeVisible()

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .js', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('download-fixture.js')
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const source = Buffer.concat(chunks).toString('utf8')
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  expect(module.assetPreset).toMatchObject({ mode: 'procedural', seed: 0, params: { width: 4 }, textures: { wall: texture } })
  const asset = module.createSavedAsset(THREE)
  expect(new THREE.Box3().setFromObject(asset.root).getSize(new THREE.Vector3()).x).toBe(4)
  expect(asset.root.children[0].position.x).toBe(0)
  asset.root.children[0].geometry.dispose()
  asset.root.children[0].material.dispose()
  expect(source).not.toContain('Unapplied draft')

  // Re-import into a fresh page: no reliance on the original in-memory document.
  const imported = await context.newPage()
  imported.on('pageerror', error => errors.push(error.message))
  await imported.goto(url)
  await imported.waitForLoadState('networkidle')
  await imported.getByRole('button', { name: 'Library', exact: true }).click()
  await imported.getByLabel('Import', { exact: true }).setInputFiles({ name: 'download-fixture.js', mimeType: 'text/javascript', buffer: Buffer.from(source) })
  await expect(imported.getByRole('slider', { name: 'Width', exact: true })).toHaveValue('4')
  await expect(imported.getByLabel('Asset seed')).toHaveText('0')
  await expect(imported.getByRole('img', { name: 'Wall texture', exact: true })).toBeVisible()
  await imported.getByRole('button', { name: 'Copy source', exact: true }).click()
  expect((await imported.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(code)
  await imported.getByRole('slider', { name: 'Width', exact: true }).fill('2')
  await expect(imported.getByRole('button', { name: 'Download .js', exact: true })).toBeEnabled()
  await expect(imported.getByRole('slider', { name: 'Width', exact: true })).toHaveValue('2')
  expect(errors).toEqual([])
  console.log('Code download: source/draft clipboard, last-good source, saved inputs, standalone geometry, and editable JS import passed')
} finally { await browser.close() }
