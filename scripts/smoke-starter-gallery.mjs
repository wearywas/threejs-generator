// Real gallery -> worker -> edit -> export/save/reload in a disposable profile.
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = [], paidRequests = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/message', route => { paidRequests.push(route.request().url()); return route.abort() })
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173')
  await page.waitForLoadState('networkidle')
  const dialog = page.getByRole('dialog', { name: 'Generation Library' })
  const downloadBytes = async name => {
    const event = page.waitForEvent('download')
    await page.getByRole('button', { name, exact: true }).click()
    const download = await event
    const chunks = []
    for await (const chunk of await download.createReadStream()) chunks.push(chunk)
    return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) }
  }
  for (const [id, name, key, label, value] of [
    ['park-apartments', 'Park Apartments', 'floorCount', 'Number of Floors', 3],
    ['woodland-mushrooms', 'Woodland Mushrooms', 'matureCount', 'Mature Mushroom Count', 3],
    ['alpine-cottage', 'Alpine Cottage', 'railingCount', 'Front Railing Balusters', 4],
  ]) {
    const record = JSON.parse(await readFile(new URL(`../public/starters/${id}.json`, import.meta.url), 'utf8'))
    await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
    await expect(dialog.getByRole('button', { name: / starter$/ })).toHaveCount(3)
    await expect.poll(() => dialog.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
    await expect(dialog.getByRole('button', { name: 'Load Mossy Rocks template', exact: true })).not.toBeVisible()
    if (process.argv[3] && id === 'park-apartments') await page.screenshot({ path: process.argv[3], fullPage: true })
    await dialog.getByRole('button', { name: `Load ${name} starter`, exact: true }).click()
    await expect(dialog).not.toBeVisible()
    const slider = page.getByRole('slider', { name: label, exact: true })
    await expect(slider).toHaveValue(String(record.params[key]))
    await slider.fill(String(value))
    await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
    const js = await downloadBytes('Download .js')
    const parsed = await page.evaluate(async source => {
      const { parseAssetSource } = await import('/src/services/assetSource.js')
      return parseAssetSource(source)
    }, js.bytes.toString('utf8'))
    expect(parsed).toEqual({ ...record, params: { ...record.params, [key]: value } })
    const glb = await downloadBytes('Download GLB')
    expect(glb.name.replace(/\.glb$/, '')).toBe(js.name.replace(/\.js$/, ''))
    expect(glb.name).not.toBe('asset.glb')
    expect(glb.bytes.subarray(0, 4).toString()).toBe('glTF')
    expect(glb.bytes.readUInt32LE(8)).toBe(glb.bytes.length)
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
    await page.getByPlaceholder('Enter a name for this asset').fill(`Edited ${name}`)
    await page.getByRole('button', { name: 'Save to Library', exact: true }).last().click()
    await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
    await dialog.getByRole('button', { name: `Load ${name} starter`, exact: true }).click()
    await expect(slider).toHaveValue(String(record.params[key]))
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    await dialog.getByRole('button', { name: `Load Edited ${name}`, exact: true }).click()
    await expect(slider).toHaveValue(String(value))
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0)
    console.log(`${name}: load, slider, matching GLB/JS downloads, preset preservation, save and reload passed`)
  }
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const backup = JSON.parse((await downloadBytes('Export')).bytes.toString('utf8'))
  expect(backup.generations).toHaveLength(3) // Only our explicit saved copies.
  // A response from an abandoned gallery must not overwrite a later selection.
  for (const leave of ['close', 'switch tab']) {
    let pending
    await page.route('**/starters/park-apartments.json', route => { pending = route })
    await page.getByRole('tab', { name: 'Templates', exact: true }).click()
    await dialog.getByRole('button', { name: 'Load Park Apartments starter', exact: true }).click()
    await expect.poll(() => !!pending).toBe(true)
    if (leave === 'close') {
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Library', exact: true }).click()
    } else await page.getByRole('tab', { name: 'Saved assets', exact: true }).click()
    await dialog.getByRole('button', { name: 'Load Edited Alpine Cottage', exact: true }).click()
    await expect(page.getByRole('slider', { name: 'Front Railing Balusters', exact: true })).toHaveValue('4')
    await pending.fulfill({ contentType: 'application/json', body: await readFile(new URL('../public/starters/park-apartments.json', import.meta.url), 'utf8') })
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('slider', { name: 'Front Railing Balusters', exact: true })).toHaveValue('4')
    await page.unroute('**/starters/park-apartments.json')
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    console.log(`Abandoned starter response after ${leave}: newer asset preserved`)
  }
  await page.getByRole('tab', { name: 'Templates', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  const bounds = await dialog.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  expect(errors).toEqual([])
  expect(paidRequests).toEqual([])
} finally { await browser.close() }
