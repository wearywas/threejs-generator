// Real-browser layout and keyboard checks. All model responses are local fixtures.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const failures = []
  page.on('pageerror', error => failures.push(error.message))
  await page.route('**/api/message', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    text: 'function createAsset(THREE) { const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xe3ad52 }))); return { root }; }',
    provider: 'openai', model: 'fixture', usage: {}
  }) }))
  await page.goto(process.argv[2] || 'http://127.0.0.1:5275')
  await page.waitForLoadState('networkidle')
  const settings = page.getByRole('button', { name: /Model settings/ })
  // Old inline settings push the canvas down and are not an accessible dialog.
  await page.getByText('Model settings', { exact: false }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Model settings', exact: true })
  await expect(dialog).toBeVisible({ timeout: 3000 })
  await page.keyboard.press('Escape')
  await page.getByPlaceholder('Describe what you want to create...').fill('A warm amber sculpture')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  const preview = page.getByLabel('Asset preview', { exact: true })
  await expect(preview).toBeVisible({ timeout: 15000 })
  const before = await preview.boundingBox()
  await settings.click()
  await expect(dialog).toBeVisible({ timeout: 3000 })
  expect(await preview.boundingBox()).toEqual(before)
  await expect(page.getByLabel('Session API key', { exact: true })).toBeVisible()
  // A modal must contain keyboard focus and return it to its opener.
  await page.keyboard.press('Shift+Tab')
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(settings).toBeFocused()
  expect(before.y).toBeLessThan(220)
  expect(before.height).toBeGreaterThan(600)
  const library = page.getByRole('button', { name: 'Library', exact: true })
  await library.click()
  await expect(page.getByRole('dialog', { name: 'Generation Library' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close library' })).toBeVisible()
  await expect(page.getByLabel('Search library')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(library).toBeFocused()
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Save to Library' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Compact laptop and phone widths must preserve a usable canvas and inspector.
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(preview).toBeVisible()
    const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
    expect(size.content).toBeLessThanOrEqual(size.width)
    expect((await preview.boundingBox()).height).toBeGreaterThanOrEqual(300)
    await settings.click()
    await expect(dialog).toBeVisible()
    const bounds = await dialog.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    await page.keyboard.press('Escape')
  }
  if (process.argv[3]) await page.screenshot({ path: process.argv[3].replace('.png', '-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByText('Generated Code', { exact: true }).scrollIntoViewIfNeeded()
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
  expect(failures).toEqual([])
  console.log('Workbench settings, modal keyboard behavior, viewport space, and responsive layout: passed')
} finally {
  await browser.close()
}
