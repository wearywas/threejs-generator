import { test, expect, downloadBytes, glbTriangleCount } from './fixtures.js'

function sceneJSON(bytes) {
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
}

test('preview GLB preserves the shown apartment grid and remains separate from batchable JS', async ({ page }, testInfo) => {
  // Multiple bounded preview replacements and GLB encodes share this test.
  test.setTimeout(120000)
  await page.goto('/')
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await page.getByRole('button', { name: 'Load Park Apartments starter', exact: true }).click()
  const single = await downloadBytes(page, 'Download GLB')
  const triangles = glbTriangleCount(single.bytes)
  await page.getByText('Advanced: batching', { exact: true }).click()
  await page.getByRole('button', { name: 'Prepare for Batching', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Batching Preview' })
  await dialog.getByLabel(/Grid Size/).fill('2')
  await dialog.getByLabel(/Spacing/).fill('24')
  await dialog.getByLabel(/Rotation Jitter/).fill('0')
  await dialog.getByLabel(/Scale Jitter/).fill('0')
  const button = dialog.getByRole('button', { name: 'Download preview GLB', exact: true })
  // Rapid setting changes can finish a superseded attach (15s), detach it
  // (15s), then attach the chosen layout (15s). Wait for that real ready state.
  await expect(button).toBeEnabled({ timeout: 50000 })
  const grid = await downloadBytes(page, 'Download preview GLB')
  expect(grid.name).toBe(single.name.replace('.glb', '.layout.glb'))
  const json = sceneJSON(grid.bytes)
  const layout = json.nodes[json.scenes[json.scene || 0].nodes[0]]
  // Subsequent seeds can add/remove window blinds. The first copy must match
  // the original exactly; distinct later variants must not be substituted for it.
  expect(glbTriangleCount(grid.bytes, [layout.children[0]])).toBe(triangles)
  expect(glbTriangleCount(grid.bytes)).toBeGreaterThan(3 * triangles)
  expect(layout.children.map(index => json.nodes[index].matrix?.slice(12, 15) || json.nodes[index].translation || [0, 0, 0]))
    .toEqual([[-12, 0, -12], [-12, 0, 12], [12, 0, -12], [12, 0, 12]])
  expect(json.extensionsUsed).toContain('EXT_mesh_gpu_instancing')
  expect(json.extensionsUsed || []).not.toContain('KHR_lights_punctual')
  expect(json.nodes.every(node => !/GridHelper|AxesHelper/.test(node.name || ''))).toBe(true)
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('apartment-batch.png') })
  await dialog.getByLabel(/Grid Size/).fill('1')
  const one = await downloadBytes(page, 'Download preview GLB')
  expect(glbTriangleCount(one.bytes)).toBe(triangles)
  const js = await downloadBytes(page, 'Download batchable JS')
  expect(js.name).toMatch(/\.batchable\.js$/)
  expect(js.bytes.toString()).toContain('export const instanceSpec')
})

test('static viewport stops presenting idle frames but wakes for orbit, resize, and parameter edits', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const original = ImageBitmapRenderingContext.prototype.transferFromImageBitmap
    ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function(bitmap) {
      this.canvas.dataset.frames = String(Number(this.canvas.dataset.frames || 0) + 1)
      return original.call(this, bitmap)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await page.getByRole('button', { name: 'Load Woodland Mushrooms starter', exact: true }).click()
  const canvas = page.getByLabel('Asset preview', { exact: true })
  await expect.poll(() => canvas.getAttribute('data-frames')).not.toBeNull()
  // Observe a stable idle window, not merely an unmounted or never-ready canvas.
  await page.waitForTimeout(500)
  const frames = Number(await canvas.getAttribute('data-frames'))
  await page.waitForTimeout(500)
  expect(Number(await canvas.getAttribute('data-frames')) - frames).toBe(0)
  const bounds = await canvas.boundingBox()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + bounds.height / 2 + 40, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(frames)
  await page.setViewportSize({ width: 1280, height: 850 })
  const beforeTriangles = glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)
  const beforeEdit = Number(await canvas.getAttribute('data-frames'))
  await page.getByRole('slider', { name: 'Mature Mushroom Count', exact: true }).fill('3')
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled({ timeout: 50000 })
  // A failed rebuild deliberately retains the old asset; report its error
  // directly rather than mistaking that recovery behavior for a bad export.
  await expect(page.getByRole('alert')).not.toBeVisible()
  expect(glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)).toBeLessThan(beforeTriangles)
  await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(beforeEdit)
  await page.screenshot({ path: testInfo.outputPath('edited-mushrooms.png') })
})

for (const motion of ['update', 'render hook']) {
  test(`${motion} animation keeps presenting frames and survives preview GLB capture`, async ({ page }) => {
    await page.addInitScript(() => {
      const original = ImageBitmapRenderingContext.prototype.transferFromImageBitmap
      ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function(bitmap) {
        this.canvas.dataset.frames = String(Number(this.canvas.dataset.frames || 0) + 1)
        return original.call(this, bitmap)
      }
    })
    const code = `function createAsset(THREE) {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({color: '#70a87e'}));
      root.add(mesh);
      ${motion === 'render hook' ? 'mesh.onBeforeRender = () => { mesh.rotation.y += 0.01; };' : ''}
      return { root ${motion === 'update' ? ', update(t) { mesh.rotation.y = t; }' : ''} };
    }`
    await page.goto('/')
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'moving-box.js', mimeType: 'text/javascript', buffer: Buffer.from(code) })
    const canvas = page.getByLabel('Asset preview', { exact: true })
    await expect.poll(() => canvas.getAttribute('data-frames')).not.toBeNull()
    const initial = Number(await canvas.getAttribute('data-frames'))
    await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(initial + 3)
    await page.getByText('Advanced: batching', { exact: true }).click()
    await page.getByRole('button', { name: 'Prepare for Batching', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Batching Preview' })
    const batch = page.getByLabel('Batch asset preview', { exact: true })
    const exported = await downloadBytes(page, 'Download preview GLB')
    expect(glbTriangleCount(exported.bytes)).toBe(9 * 12)
    const captured = Number(await batch.getAttribute('data-frames'))
    await expect.poll(async () => Number(await batch.getAttribute('data-frames'))).toBeGreaterThan(captured + 3)
    await dialog.getByRole('button', { name: 'Close batching preview', exact: true }).click()
    const resumed = Number(await canvas.getAttribute('data-frames'))
    await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(resumed + 3)
  })
}
