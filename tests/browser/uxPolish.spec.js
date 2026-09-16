import { test, expect, downloadBytes } from './fixtures.js'

const code = 'function createAsset(THREE) { return { root: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()) }; }'

async function loadAsset(page) {
  await page.route('**/api/message', () => { throw new Error('Editing and saving source must not call a model') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'test-cube.js', mimeType: 'text/javascript', buffer: Buffer.from(code) })
  await expect(page.getByRole('button', { name: 'Download GLB', exact: true })).toBeEnabled()
}

test('the empty viewport omits its redundant slogan while retaining the navigation hint', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeVisible()
  await expect(page.getByText('Your next idea, in 3D', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Drag to orbit · Scroll to zoom', { exact: true })).toBeVisible()
})

test('generation spinner has a black leading edge against its amber button', async ({ page }, testInfo) => {
  let held
  await page.route('**/api/message', route => { held = route })
  await page.goto('/')
  await page.getByLabel('Describe your asset', { exact: true }).fill('A test cube')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect.poll(() => !!held).toBe(true)
  const button = page.getByRole('button', { name: 'Generating...', exact: true })
  await expect(button.locator('.spinner')).toHaveCSS('border-top-color', 'rgb(0, 0, 0)')
  await page.screenshot({ path: testInfo.outputPath('generation-progress.png') })
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click()
  await held.abort().catch(() => {})
})

test('saving keeps name and tags after a backdrop click and supports explicit dismissal', async ({ page }) => {
  await loadAsset(page)
  const open = () => page.getByRole('button', { name: 'Save to Library', exact: true }).click()
  await open()
  const dialog = page.getByRole('dialog', { name: 'Save to Library', exact: true })
  await dialog.getByLabel('Name', { exact: false }).fill('A carefully named cube')
  await dialog.getByLabel('Tags', { exact: false }).fill('game, prop')
  await page.mouse.click(2, 2)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Name', { exact: false })).toHaveValue('A carefully named cube')
  await expect(dialog.getByLabel('Tags', { exact: false })).toHaveValue('game, prop')
  await dialog.getByRole('button', { name: 'Save to Library', exact: true }).click()
  await expect(dialog).toBeHidden()
  for (const action of ['Cancel', 'Close save dialog', 'Escape']) {
    await open()
    if (action === 'Escape') await page.keyboard.press('Escape')
    else await dialog.getByRole('button', { name: action, exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Load A carefully named cube', exact: true })).toBeVisible()
})

test('editor Cancel restores the opening text, including an existing draft, without changing the asset', async ({ page }) => {
  await loadAsset(page)
  const initialExport = (await downloadBytes(page, 'Download .js')).bytes.toString()
  const edit = page.getByRole('button', { name: 'Edit', exact: true })
  const input = page.getByLabel('Asset code draft', { exact: true })
  await edit.click()
  const original = await input.inputValue()
  await input.fill(original + '\n// discard this change')
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
  await expect(cancel).toBeVisible()
  await cancel.click()
  await expect(input).toBeHidden()
  await expect(page.getByRole('button', { name: 'Copy source', exact: true })).toBeVisible()
  await edit.click()
  await expect(input).toHaveValue(original)
  const retained = original + '\n// keep this unapplied draft'
  await input.fill(retained)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await edit.click()
  await input.fill('invalid replacement')
  await cancel.click()
  await expect(page.getByRole('button', { name: 'Copy draft', exact: true })).toBeVisible()
  await edit.click()
  await expect(input).toHaveValue(retained)
  await cancel.click()
  expect((await downloadBytes(page, 'Download .js')).bytes.toString()).toBe(initialExport)
  await expect(page.getByLabel('Recovery status')).toHaveText(/Recovery saved/)
  await page.reload()
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
  await edit.click()
  await expect(input).toHaveValue(retained)
})
