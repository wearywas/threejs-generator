// Real app, isolated browser profile, and stubbed provider responses: no paid requests.
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const url = process.argv[2] || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
const code = `function createAsset(THREE, seed, textures, params) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, params.floors || 1, 1), new THREE.MeshStandardMaterial()));
  return { root };
}`
const schema = { floors: { type: 'integer', min: 1, max: 5, default: 1, label: 'Floors' } }
const record = { id: 'guidance-fixture', name: 'Guidance fixture', documentVersion: 1, mode: 'creative',
  prompt: 'A small building', code, seed: 42, params: {}, textures: {}, schema: null, textureSlots: [], tags: [], createdAt: 1 }
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  const requests = [], errors = []
  let reply = 'failure', waitingRoute
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.route('**/api/message', async route => {
    requests.push(route.request().postDataJSON())
    if (reply === 'pending') { waitingRoute = route; return }
    if (reply === 'failure') return route.fulfill({ status: 503, json: { error: 'Test provider unavailable', code: 'provider_unavailable', retryable: false } })
    return route.fulfill({ json: { text: JSON.stringify({ code, schema }), provider: 'openai', model: 'test', stopReason: 'completed' } })
  })
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 2, generations: [record] })) })
  await page.getByRole('button', { name: 'Load Guidance fixture', exact: true }).click()
  const opener = page.getByRole('button', { name: 'Add editable controls', exact: true })
  await expect(opener).toBeEnabled()
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Add editable controls', exact: true })
  await expect(dialog).toBeVisible()
  expect(requests).toHaveLength(0)
  const guidance = dialog.getByRole('textbox', { name: 'What would you like to control? (optional)', exact: true })
  await expect(guidance).toBeFocused()
  await guidance.fill('Make the floor count and room count adjustable.')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(opener).toBeFocused()
  expect(requests).toHaveLength(0)

  await opener.click()
  await expect(guidance).toHaveValue('')
  const request = 'Make the floor count and room count adjustable.'
  await guidance.fill(`  ${request}  `)
  await dialog.getByRole('button', { name: 'Add editable controls', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Test provider unavailable')
  await expect(guidance).toHaveValue(`  ${request}  `)
  expect(requests).toHaveLength(1)
  expect(requests[0].messages[0].content).toContain(request)
  expect(requests[0].task).toBe('convert')
  reply = 'success'
  await dialog.getByRole('button', { name: 'Add editable controls', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('slider', { name: 'Floors', exact: true })).toHaveValue('1')
  await expect(page.getByLabel('Asset seed')).toHaveText('42')
  expect(requests[1].messages[0].content).toContain(request)

  // Automatic conversion remains available, including whitespace-only guidance.
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Load Guidance fixture', exact: true }).click()
  await opener.click()
  await guidance.fill('   ')
  await dialog.getByRole('button', { name: 'Add editable controls', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(requests[2].messages[0].content).not.toContain(request)
  expect(requests[2].messages[0].content).toContain('A small building')

  // A pending request has a real cancellation path and cannot submit twice.
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Load Guidance fixture', exact: true }).click()
  await opener.click()
  reply = 'pending'
  await guidance.fill('Make roof pitch adjustable')
  await dialog.getByRole('button', { name: 'Add editable controls', exact: true }).click()
  await expect.poll(() => requests.length).toBe(4)
  await expect(guidance).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Converting...', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel conversion request', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(opener).toBeEnabled()
  await waitingRoute.abort().catch(() => {})
  expect(requests).toHaveLength(4)

  await opener.click()
  await page.setViewportSize({ width: 390, height: 740 })
  await expect(guidance).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const box = await dialog.boundingBox()
  expect(box.width).toBeLessThanOrEqual(390)
  expect(box.height).toBeLessThanOrEqual(740)
  await page.screenshot({ path: join(tmpdir(), 'threejs-conversion-guidance-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(tmpdir(), 'threejs-conversion-guidance.png') })
  expect(errors).toEqual([])
  console.log('Conversion guidance: no request on open/cancel, guidance payload, blank fallback, failed-request retry, seed preservation, cancellation, and mobile layout passed.')
} finally { await browser.close() }
