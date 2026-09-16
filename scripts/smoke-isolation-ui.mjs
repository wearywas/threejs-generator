// Run against either development or the actual production bundle. No paid calls.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.route('**/api/message', route => route.abort())
  await page.goto(process.argv[2] || 'http://127.0.0.1:5276')
  await page.waitForLoadState('networkidle')
  const importCode = async (name, source) => {
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    await page.getByLabel('Import', { exact: true }).setInputFiles({ name: name + '.js', mimeType: 'text/javascript', buffer: Buffer.from(source) })
  }
  const cube = 'function createAsset(THREE){ return {root: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({color:0x55aacc}))}; }'
  await importCode('safe cube', cube)
  await expect(page.getByLabel('Asset seed')).toBeVisible()
  const originalSeed = await page.getByLabel('Asset seed').textContent()
  await importCode('infinite factory', 'function createAsset(){while(true){}}')
  await expect(page.getByText(/Asset init timed out; the isolated worker was stopped/)).toBeVisible({ timeout: 12000 })
  await expect(page.getByLabel('Asset seed')).toHaveText(originalSeed)
  await expect(page.getByRole('button', { name: 'Download GLB', exact: true })).toBeEnabled()
  await importCode('cancel factory', 'function createAsset(){while(true){}}')
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).not.toBeVisible()
  await expect(page.getByLabel('Asset seed')).toHaveText(originalSeed)
  await importCode('infinite animation', 'function createAsset(THREE){ return {root:new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),update(){while(true){}}}; }')
  await expect(page.getByRole('alert').filter({ hasText: /Preview unavailable:.*timed out/ })).toBeVisible({ timeout: 12000 })
  // Recovery does not require a live renderer or worker: source still saves.
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
  await expect(page.getByPlaceholder('Enter a name for this asset')).toBeVisible()
  await page.getByPlaceholder('Enter a name for this asset').fill('Recoverable source')
  await page.getByRole('button', { name: 'Save to Library', exact: true }).last().click()
  await expect(page.getByPlaceholder('Enter a name for this asset')).not.toBeVisible()
  expect(errors).toEqual([])
  console.log('UI isolation: factory timeout, cancellation, last-good retention, animation watchdog, and source recovery passed')
} finally { await browser.close() }
