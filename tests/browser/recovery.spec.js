import { test, expect, downloadBytes } from './fixtures.js'

async function loadExample(page) {
  await page.getByRole('button', { name: 'Try an example', exact: true }).click()
  await page.getByRole('button', { name: 'Load Park Apartments starter', exact: true }).click()
  await expect(page.getByLabel('Recovery status')).toHaveText(/Recovery saved in this browser/)
}

test('first-run actions open setup and free examples; local recovery restores working inputs and an unapplied draft', async ({ page }, testInfo) => {
  await page.route('**/api/message', () => { throw new Error('Local recovery must never request a model') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect a model', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Model settings' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('welcome-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await loadExample(page)
  await page.getByRole('slider', { name: 'Number of Floors', exact: true }).fill('3')
  await expect(page.getByRole('button', { name: 'Download .js', exact: true })).toBeEnabled()
  const source = (await downloadBytes(page, 'Download .js')).bytes.toString()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const draft = 'this is an unfinished code draft; do not execute it'
  await page.getByLabel('Asset code draft').fill(draft)
  await expect(page.getByLabel('Recovery status')).toHaveText(/Recovery saved in this browser/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Restore workspace', exact: true })).toBeVisible()
  await expect(page.locator('.viewport-canvas canvas')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Number of Floors', exact: true })).toHaveValue('3')
  await expect(page.getByLabel('Asset seed')).toHaveText('94918309')
  await expect(page.getByText(/Code draft not applied/)).toBeVisible()
  expect((await downloadBytes(page, 'Download .js')).bytes.toString()).toBe(source)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Asset code draft')).toHaveValue(draft)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Generation Library' })).toContainText('0 saved assets')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Recovery status')).toHaveText(/Recovery saved in this browser/)
  await page.reload()
  await page.getByRole('button', { name: 'Discard recovery', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Restore workspace', exact: true })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeEnabled()
})

test('storage failure warns without breaking the working model or downloads', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'threejs-generator-recovery') throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Try an example', exact: true }).click()
  await page.getByRole('button', { name: 'Load Park Apartments starter', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/not protected.*Storage quota exceeded/)
  await expect(page.getByLabel('Recovery status')).not.toBeVisible()
  expect((await downloadBytes(page, 'Download GLB')).bytes.subarray(0, 4).toString()).toBe('glTF')
})

test('another tab cannot silently replace the recovery copy', async ({ page, context }) => {
  await page.goto('/')
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByRole('button', { name: 'Try an example', exact: true })).toBeEnabled()
  await loadExample(page)
  await second.getByRole('button', { name: 'Try an example', exact: true }).click()
  await second.getByRole('button', { name: 'Load Woodland Mushrooms starter', exact: true }).click()
  // The recovery write follows broker/worker startup and factory initialization.
  await expect(second.getByRole('alert')).toContainText('Another tab updated the recovery copy', { timeout: 30000 })
  await second.close()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Workspace recovery' })).toContainText('A modern apartment building.')
})

test('a generated result is recovered without another request; repair progress and modal cancellation stay truthful', async ({ page }, testInfo) => {
  const code = `function createAsset(THREE) {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: 0x6598bb})));
    return { root };
  }`
  const requests = []
  let repairRoute
  await page.route('**/api/message', route => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) return route.fulfill({ json: {
      provider: 'openai', model: 'synthetic-test-model', text: 'function createAsset() { throw new Error("Deliberate test failure") }',
    } })
    repairRoute = route
  })
  await page.goto('/')
  await page.getByLabel('Describe your asset', { exact: true }).fill('A blue cube')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Waiting for model repair response' })).toBeVisible()
  await expect(page.getByText('Model request 2 · maximum 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Repair requests: 1 (included above)', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Why another request?' })).toContainText('The generated code stopped with an error while building the model.')
  expect(requests[1].messages[0].content).toContain('Deliberate test failure')
  await page.screenshot({ path: testInfo.outputPath('repair-progress.png') })
  await expect(page.getByRole('timer')).toHaveText(/Elapsed 0:0[1-9]/)
  await repairRoute.fulfill({ json: { provider: 'openai', model: 'synthetic-test-model', text: code } })
  await expect(page.getByLabel('Recovery status')).toHaveText(/Recovery saved in this browser/)
  await expect(page.getByRole('timer')).not.toBeVisible()
  const source = (await downloadBytes(page, 'Download .js')).bytes.toString()
  await page.reload()
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
  await expect(page.getByLabel('Recovery status')).toHaveText(/Recovery saved in this browser/)
  expect((await downloadBytes(page, 'Download .js')).bytes.toString()).toBe(source)
  expect(requests).toHaveLength(2)
  await page.unroute('**/api/message')

  for (const [button, dialogName, submit, cancel, task] of [
    ['Add editable controls', 'Add editable controls', 'Add editable controls', 'Cancel conversion request', 'convert'],
    ['AI Edit', 'Generative Edit', 'Apply Edit', 'Cancel edit request', 'edit'],
  ]) {
    let held
    await page.route('**/api/message', route => { held = route })
    await page.getByRole('button', { name: button, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: dialogName, exact: true })
    if (task === 'edit') await dialog.getByRole('textbox').fill('Make it red')
    await dialog.getByRole('button', { name: submit, exact: true }).click()
    await expect.poll(() => held?.request().postDataJSON().task).toBe(task)
    await expect(dialog.getByRole('status')).toHaveText('Waiting for model response...')
    await expect(dialog.getByRole('timer')).toHaveText(/Elapsed 0:0[1-9]/)
    await dialog.getByRole('button', { name: cancel, exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('timer')).not.toBeVisible()
    expect((await downloadBytes(page, 'Download .js')).bytes.toString()).toBe(source)
    await held.abort().catch(() => {})
    await page.unroute('**/api/message')
  }
})

test('a failed restore retains the recovery copy for another attempt or explicit discard', async ({ page }) => {
  await page.goto('/')
  await loadExample(page)
  // Simulate an old saved factory becoming unexecutable, using real persistent storage.
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('threejs-generator-recovery', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite')
      tx.oncomplete = resolve
      tx.onabort = () => reject(tx.error)
      const store = tx.objectStore('drafts')
      const request = store.get('workspace')
      request.onsuccess = () => {
        const record = request.result
        record.document.code = 'function createAsset() { throw new Error("Saved factory cannot execute") }'
        store.put(record, 'workspace')
      }
    })
    db.close()
  })
  await page.reload()
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Saved factory cannot execute')
  await expect(page.getByRole('button', { name: 'Restore workspace', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Restore workspace', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Discard recovery', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeEnabled()
})

test('recovery can explicitly enable the higher triangle budget used by the saved asset', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('checkbox', { name: 'Uncap Tri Count' }).check()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const code = `function createAsset(THREE) {
    return { root: new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), new THREE.MeshStandardMaterial()) };
  }`
  await page.getByLabel('Import', { exact: true }).setInputFiles({ name: 'detailed-sphere.js', mimeType: 'text/javascript', buffer: Buffer.from(code) })
  await expect(page.getByLabel('Recovery status')).toHaveText(/Recovery saved in this browser/)
  await page.reload()
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('exceeds maximum (50000)')
  await expect(page.getByRole('checkbox', { name: 'Uncap Tri Count' })).toBeEnabled()
  await page.getByRole('checkbox', { name: 'Uncap Tri Count' }).check()
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
  await expect(page.getByLabel('Recovery status')).toHaveText(/Recovery saved in this browser/)
  await expect(page.getByRole('button', { name: 'Download GLB', exact: true })).toBeEnabled()
})

test('cross-tab deletion withdraws the saved badge and enables an unsaved-work warning', async ({ page, context }) => {
  await page.goto('/')
  await loadExample(page)
  const second = await context.newPage()
  await second.goto('/')
  await second.getByRole('button', { name: 'Discard recovery', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Another tab updated the recovery copy')
  await expect(page.getByLabel('Recovery status')).not.toBeVisible()
  const dialog = page.waitForEvent('dialog')
  // A dismissed beforeunload never reaches the navigation load event that
  // Playwright's page.reload() waits for. Trigger it without awaiting that event.
  await page.evaluate(() => { setTimeout(() => location.reload(), 0) })
  const warning = await dialog
  expect(warning.type()).toBe('beforeunload')
  await warning.dismiss()
  await expect(page.getByLabel('Asset seed')).toHaveText('94918309')
})
