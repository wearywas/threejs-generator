// Verify the installed editor works offline; never call a model provider.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const origin = new URL(process.argv[2] || 'http://127.0.0.1:5275').origin
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const remoteRequests = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) {
      remoteRequests.push(url.origin)
      return route.abort()
    }
    if (url.pathname === '/api/message') throw new Error('Offline editor must not call a model')
    return route.continue()
  })
  await page.goto(origin)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await page.locator('[data-template-generator="rockCluster"]').click()
  const editor = page.locator('.monaco-editor').first()
  await expect(editor).toBeVisible({ timeout: 15000 })
  const lines = editor.locator('.view-lines')
  await expect(lines).toContainText('rockCluster')
  await expect(lines).toContainText(/"count":\s*5/)
  const before = await lines.innerText()
  await lines.click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('not allowed in a read-only spec')
  await expect(lines).toHaveText(before)
  await page.getByRole('slider', { name: 'count', exact: true }).fill('8')
  await expect(lines).toContainText(/"count":\s*8/)
  // Monaco's folding shortcut must still work with locally bundled JSON support.
  await lines.click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Control+K')
  await page.keyboard.press('Control+0')
  await expect(lines).not.toContainText('rockCluster')
  await page.keyboard.press('Control+K')
  await page.keyboard.press('Control+J')
  await expect(lines).toContainText('rockCluster')
  expect(remoteRequests).toEqual([])
  expect(errors).toEqual([])
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
  console.log('Offline local JSON editor: rendering, read-only input, parameter updates and folding passed')
} finally {
  await browser.close()
}
