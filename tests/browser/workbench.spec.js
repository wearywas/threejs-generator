import { readFile } from 'node:fs/promises'
import { test, expect, downloadBytes, glbTriangleCount } from './fixtures.js'

for (const [id, name, key, label, value] of [
  ['park-apartments', 'Park Apartments', 'floorCount', 'Number of Floors', 3],
  ['woodland-mushrooms', 'Woodland Mushrooms', 'matureCount', 'Mature Mushroom Count', 3],
  ['alpine-cottage', 'Alpine Cottage', 'railingCount', 'Front Railing Balusters', 4],
]) {
  test(`${name}: offline edit, JS/GLB export and saved-copy restoration`, async ({ page }) => {
    const record = JSON.parse(await readFile(new URL(`../../public/starters/${id}.json`, import.meta.url), 'utf8'))
    await page.route('**/api/message', () => { throw new Error('Starter editing must not request a model') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
    const library = page.getByRole('dialog', { name: 'Generation Library' })
    const card = library.getByRole('button', { name: `Load ${name} starter`, exact: true })
    await expect.poll(() => card.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await card.click()
    const slider = page.getByRole('slider', { name: label, exact: true })
    await expect(slider).toHaveValue(String(record.params[key]))
    const originalTriangles = glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)
    await slider.fill(String(value))
    await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
    const js = await downloadBytes(page, 'Download .js')
    // Parse only the data section; never evaluate downloaded factory source.
    const preset = JSON.parse(js.bytes.toString('utf8').match(/^export const assetPreset = JSON\.parse\(String\.raw`([^`]*?)`\);$/m)[1])
    expect(preset).toMatchObject({ seed: record.seed, schema: record.schema, params: { ...record.params, [key]: value }, textures: record.textures })
    expect(js.bytes.toString('utf8')).toContain(record.code)
    const glb = await downloadBytes(page, 'Download GLB')
    expect(glb.name.replace(/\.glb$/, '')).toBe(js.name.replace(/\.js$/, ''))
    expect(glb.name).not.toBe('asset.glb')
    const editedTriangles = glbTriangleCount(glb.bytes)
    // Each fixture reduces a repeated structural part, not merely a UI value.
    expect(editedTriangles).toBeLessThan(originalTriangles)
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
    await page.getByPlaceholder('Enter a name for this asset').fill(`Edited ${name}`)
    await page.getByRole('button', { name: 'Save to Library', exact: true }).last().click()
    await expect(page.getByRole('dialog', { name: 'Save to Library', exact: true })).not.toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Discard recovery', exact: true }).click()
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    await library.getByRole('button', { name: `Load Edited ${name}`, exact: true }).click()
    await expect(slider).toHaveValue(String(value))
    await expect(page.getByLabel('Asset seed')).toHaveText(String(record.seed))
    expect(glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)).toBe(editedTriangles)
    await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
    await card.click()
    await expect(slider).toHaveValue(String(record.params[key]))
    expect(glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)).toBe(originalTriangles)
  })
}

test('built-in template JSON editor and controls work without CDN resources', async ({ page, request }) => {
  // Notices must survive the real production build and static server, too.
  for (const file of ['third-party-licenses.txt', 'THIRD_PARTY_NOTICES.txt', 'licenses/monaco-third-party.txt']) {
    const response = await request.get(`/${file}`)
    expect(response.ok(), file).toBe(true)
    expect((await response.text()).length).toBeGreaterThan(100)
  }
  const languageWorkerRequests = []
  page.on('request', request => {
    if (/json\.worker/.test(request.url())) languageWorkerRequests.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await page.getByText('Built-in generators', { exact: true }).click()
  await page.locator('[data-template-generator="rockCluster"]').click()
  const lines = page.locator('.monaco-editor .view-lines').first()
  await expect(lines).toContainText('rockCluster')
  await expect.poll(() => lines.locator('span[class*="mtk"]').evaluateAll(spans =>
    new Set(spans.map(span => getComputedStyle(span).color)).size)).toBeGreaterThan(1)
  await page.getByRole('slider', { name: 'count', exact: true }).fill('8')
  await expect(lines).toContainText(/"count":\s*8/)
  // Keep JSON-specific word selection: copying a color must retain its '#'.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await lines.click()
  await page.keyboard.press('Control+f')
  await page.getByRole('textbox', { name: 'Find', exact: true }).fill('#737c79')
  await page.keyboard.press('Escape')
  await lines.locator('span').filter({ hasText: /^"#737c79"$/ }).last().dblclick()
  await page.keyboard.press('Control+c')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('#737c79')
  // Compare the whole spec, not Monaco's recycled/virtualized visible lines.
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+c')
  const original = await page.evaluate(() => navigator.clipboard.readText())
  expect(JSON.parse(original)).toMatchObject({ generator: 'rockCluster', params: { count: 8 } })
  await page.keyboard.type('cannot edit a read-only template spec')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+c')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(original)
  expect(languageWorkerRequests).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  const bounds = await page.getByRole('dialog', { name: 'Generation Library' }).boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
})

test('an infinite imported factory times out without losing the last working asset', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await page.getByRole('button', { name: 'Load Park Apartments starter', exact: true }).click()
  await expect(page.getByLabel('Asset seed')).toHaveText('94918309')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'infinite.js', mimeType: 'text/javascript', buffer: Buffer.from('function createAsset(){while(true){}}') })
  await expect(page.getByText(/Asset init timed out; the isolated worker was stopped/)).toBeVisible({ timeout: 15000 })
  await expect(page.getByLabel('Asset seed')).toHaveText('94918309')
  await expect(page.getByRole('button', { name: 'Download GLB', exact: true })).toBeEnabled()
  const glb = await downloadBytes(page, 'Download GLB')
  expect(glb.bytes.subarray(0, 4).toString()).toBe('glTF')
})
