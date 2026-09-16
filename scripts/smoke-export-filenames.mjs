// Actual downloads in a fresh browser context, with all API requests blocked.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const url = process.argv[2] || 'http://127.0.0.1:5173'
const record = {
  id: 'export-filename-fixture', documentVersion: 1, mode: 'creative',
  name: 'Filename fixture',
  prompt: 'A beautiful ancient mountain village surrounded by waterfalls beyond',
  family: 'general', seed: 12345, params: {}, textures: {}, tags: [], createdAt: 1,
  code: `function createAsset(THREE) {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    return { root };
  }`,
}
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
try {
  const context = await browser.newContext({ acceptDownloads: true })
  await context.route('**/*', route => {
    const requestURL = new URL(route.request().url())
    return requestURL.pathname.startsWith('/api/') || requestURL.origin !== new URL(url).origin
      ? route.abort()
      : route.continue()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({
    name: 'fixture.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 2, generations: [record] })),
  })
  await page.getByRole('button', { name: 'Load Filename fixture', exact: true }).click()
  const stem = 'a-beautiful-ancient-mountain-village-surrounded-by'
  // Repeat GLB to verify the app adds no counter, hash, or timestamp.
  for (const [label, extension] of [['Download GLB', 'glb'], ['Download .js', 'js'], ['Download GLB', 'glb']]) {
    const button = page.getByRole('button', { name: label, exact: true })
    await expect(button).toBeEnabled()
    const downloading = page.waitForEvent('download')
    await button.click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe(`${stem}.${extension}`)
    expect(await download.failure()).toBeNull()
    const chunks = []
    for await (const chunk of await download.createReadStream()) chunks.push(chunk)
    const bytes = Buffer.concat(chunks)
    if (extension === 'glb') expect(bytes.subarray(0, 4).toString()).toBe('glTF')
    else expect(bytes.toString()).toContain('export function createSavedAsset')
  }
  expect(errors).toEqual([])
  console.log('Export filenames: matching prompt-based GLB/JS names, valid payloads, and stable repeated download names passed')
} finally {
  await browser.close()
}
