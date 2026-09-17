import { test, expect } from './fixtures.js'

test('invalid model coordinates produce a readable retry explanation in the real worker flow', async ({ page }, testInfo) => {
  let requests = 0, retryRoute
  await page.route('**/api/message', route => {
    if (++requests > 1) { retryRoute = route; return }
    return route.fulfill({ json: { provider: 'openai', model: 'synthetic-test-model', text: `function createAsset(THREE) {
      const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      root.position.set(NaN, NaN, NaN);
      return { root };
    }` } })
  })
  await page.goto('/')
  await page.getByLabel('Describe your asset', { exact: true }).fill('A test cube')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  const explanation = page.getByRole('status').filter({ hasText: 'Why another request?' })
  await expect(explanation).toHaveText('Why another request? The generated model has an invalid size or position, so it could not be displayed.')
  await expect(page.getByText('Model request 2 · maximum 3', { exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/Elapsed 0:0[1-9]/)
  await expect(explanation).not.toContainText(/invalid_type|runtimeSignals|nan|…/)
  await page.screenshot({ path: testInfo.outputPath('readable-retry-reason.png') })
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click()
  await expect(explanation).not.toBeVisible()
  expect(requests).toBe(2)
  await retryRoute.abort().catch(() => {})
})
