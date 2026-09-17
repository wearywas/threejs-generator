import { test, expect, downloadBytes } from './fixtures.js'

// Exercise the production progress store, React subscriptions and dialogs. Only
// time and the paid model response are controlled; asset execution stays real.
test('elapsed time advances, clears on completion/cancel, and resets for the next operation', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-17T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-09-17T13:00:00Z'))
  let held
  const requests = []
  await page.route('**/api/message', route => {
    held = route
    requests.push(route.request().postDataJSON().task)
  })
  await page.goto('/')
  await page.getByLabel('Describe your asset', { exact: true }).fill('A blue cube')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect.poll(() => requests).toEqual(['creative'])
  const timer = page.getByRole('timer')
  await expect(timer).toHaveText('Elapsed 0:00')
  await page.clock.runFor(2000)
  await expect(timer).toHaveText('Elapsed 0:02')
  await held.fulfill({ json: { provider: 'openai', model: 'synthetic-test-model', text:
    'function createAsset() { throw new Error("Deliberate test failure") }',
  } })
  await expect.poll(() => requests).toEqual(['creative', 'creative'])
  await expect(page.getByRole('status').filter({ hasText: 'Waiting for model repair response' })).toBeVisible()
  await expect(timer).toHaveText('Elapsed 0:02')
  await page.clock.runFor(2000)
  await expect(timer).toHaveText('Elapsed 0:04')
  await held.fulfill({ json: { provider: 'openai', model: 'synthetic-test-model', text: `function createAsset(THREE) {
    return { root: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x6598bb })) };
  }` } })
  await expect(page.getByRole('button', { name: 'Download .js', exact: true })).toBeEnabled({ timeout: 50000 })
  await expect(timer).not.toBeVisible()
  const source = (await downloadBytes(page, 'Download .js')).bytes.toString()

  // Conversion followed by repeated edits catches stale completion/cancellation
  // callbacks and timers carried over from the previous request.
  for (const [button, dialogName, submit, cancel, task] of [
    ['Add editable controls', 'Add editable controls', 'Add editable controls', 'Cancel conversion request', 'convert'],
    ['AI Edit', 'Generative Edit', 'Apply Edit', 'Cancel edit request', 'edit'],
    ['AI Edit', 'Generative Edit', 'Apply Edit', 'Cancel edit request', 'edit'],
  ]) {
    held = undefined
    await page.getByRole('button', { name: button, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: dialogName, exact: true })
    // Let the newly opened dialog paint and run its input-reset effect before
    // typing; the clock deliberately prevents normal animation-frame delivery.
    await page.clock.runFor(16)
    if (task === 'edit') await dialog.getByRole('textbox').fill('Make it red')
    await dialog.getByRole('button', { name: submit, exact: true }).click()
    await expect.poll(() => held?.request().postDataJSON().task).toBe(task)
    await expect(dialog.getByRole('timer')).toHaveText('Elapsed 0:00')
    await page.clock.runFor(2000)
    await expect(dialog.getByRole('timer')).toHaveText('Elapsed 0:02')
    await dialog.getByRole('button', { name: cancel, exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await held.abort().catch(() => {})
    await page.clock.runFor(1000)
    await expect(timer).not.toBeVisible()
    expect((await downloadBytes(page, 'Download .js')).bytes.toString()).toBe(source)
  }
  held = undefined
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect.poll(() => held?.request().postDataJSON().task).toBe('creative')
  await expect(timer).toHaveText('Elapsed 0:00')
  await page.clock.runFor(2000)
  await expect(timer).toHaveText('Elapsed 0:02')
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click()
  await held.abort().catch(() => {})
  await page.clock.runFor(1000)
  await expect(timer).not.toBeVisible()
  expect((await downloadBytes(page, 'Download .js')).bytes.toString()).toBe(source)
  expect(requests).toEqual(['creative', 'creative', 'convert', 'edit', 'edit', 'creative'])
})
