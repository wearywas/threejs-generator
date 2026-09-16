import { test, expect, downloadBytes, glbTriangleCount } from './fixtures.js'

for (const starter of ['Park Apartments', 'Woodland Mushrooms']) {
test(`${starter}: automatic optimization reduces draw calls without changing the exported geometry count`, async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await page.getByRole('button', { name: `Load ${starter} starter`, exact: true }).click()
  await page.getByText('Advanced: batching', { exact: true }).click()
  await page.getByRole('button', { name: 'Prepare for Batching', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Batching Preview' })
  await dialog.getByLabel(/Grid Size/).fill('2')
  const original = await downloadBytes(page, 'Download preview GLB')
  const canvas = page.getByLabel('Batch asset preview', { exact: true })
  // Capture the actual presented pixels at the same camera, not a new factory.
  await canvas.evaluate(async canvas => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const copy = document.createElement('canvas')
    copy.width = canvas.width; copy.height = canvas.height
    const context = copy.getContext('2d')
    context.drawImage(canvas, 0, 0)
    window.batchOriginalPixels = context.getImageData(0, 0, copy.width, copy.height)
  })
  await page.getByRole('button', { name: 'Optimize layout', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Optimized', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const before = Number(await dialog.getByLabel('Original draw calls', { exact: true }).textContent())
  const after = Number(await dialog.getByLabel('Optimized draw calls', { exact: true }).textContent())
  expect(after).toBeLessThan(before)
  const optimized = await downloadBytes(page, 'Download optimized GLB')
  expect(optimized.name).toBe(original.name.replace('.layout.glb', '.optimized.layout.glb'))
  expect(glbTriangleCount(optimized.bytes)).toBe(glbTriangleCount(original.bytes))
  // Float32 matrix folding can move edge samples slightly; a changed facade or
  // missing material produces a much larger per-channel image difference.
  const difference = await canvas.evaluate(async canvas => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const copy = document.createElement('canvas')
    copy.width = canvas.width; copy.height = canvas.height
    const context = copy.getContext('2d')
    context.drawImage(canvas, 0, 0)
    const current = context.getImageData(0, 0, copy.width, copy.height)
    const original = window.batchOriginalPixels
    if (current.width !== original.width || current.height !== original.height) throw new Error('Compare changed the viewport size')
    let error = 0
    for (let i = 0; i < current.data.length; i++) error += Math.abs(current.data[i] - original.data[i])
    return error / current.data.length
  })
  expect(difference).toBeLessThan(0.5)
  await testInfo.attach('optimization-measurements', { body: JSON.stringify({ before, after, meanChannelDifference: difference }), contentType: 'application/json' })
  await page.screenshot({ path: testInfo.outputPath('optimized-layout.png') })
  await dialog.getByRole('button', { name: 'Original', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Original', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const restored = await downloadBytes(page, 'Download preview GLB')
  expect(glbTriangleCount(restored.bytes)).toBe(glbTriangleCount(original.bytes))
  await dialog.getByLabel(/Spacing/).fill('30')
  await expect(dialog.getByRole('button', { name: 'Optimize layout', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Optimized', exact: true })).toHaveCount(0)
})
}

test('animated layouts explain why optimization is skipped and retain the original download', async ({ page }) => {
  const code = `function createAsset(THREE) {
    const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    return { root, update(t) { root.rotation.y = t; } };
  }`
  await page.goto('/')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'animated.js', mimeType: 'text/javascript', buffer: Buffer.from(code) })
  await page.getByText('Advanced: batching', { exact: true }).click()
  await page.getByRole('button', { name: 'Prepare for Batching', exact: true }).click()
  await page.getByRole('button', { name: 'Optimize layout', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Optimization result' })).toContainText(/animat/i)
  await expect(page.getByRole('button', { name: 'Download preview GLB', exact: true })).toBeEnabled()
  expect(glbTriangleCount((await downloadBytes(page, 'Download preview GLB')).bytes)).toBe(108)
})

test('order-dependent opaque materials keep the original layout instead of changing its appearance', async ({ page }) => {
  const code = `function createAsset(THREE) {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const red = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x0000ff, depthTest: false });
    root.add(new THREE.Mesh(geometry, red), new THREE.Mesh(geometry, blue), new THREE.Mesh(geometry, red));
    return { root };
  }`
  await page.goto('/')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'ordered.js', mimeType: 'text/javascript', buffer: Buffer.from(code) })
  await page.getByText('Advanced: batching', { exact: true }).click()
  await page.getByRole('button', { name: 'Prepare for Batching', exact: true }).click()
  const original = await downloadBytes(page, 'Download preview GLB')
  await page.getByRole('button', { name: 'Optimize layout', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Optimization result' })).toContainText(/order/i)
  await expect(page.getByRole('button', { name: 'Optimized', exact: true })).toHaveCount(0)
  const retained = await downloadBytes(page, 'Download preview GLB')
  expect(glbTriangleCount(retained.bytes)).toBe(glbTriangleCount(original.bytes))
})
