import { test, expect, downloadBytes, glbTriangleCount } from './fixtures.js'

// Playwright's page fixture supplies a disposable context for every test.
test.use({ headless: true, storageState: { cookies: [], origins: [] } })
test.setTimeout(45000)

const sentinel = 'synthetic-fresh-user-noncredential'
const settingsButton = page => page.getByRole('button', { name: /^Model settings:/ })
const generateButton = page => page.getByRole('button', { name: 'Generate', exact: true })
const libraryDialog = page => page.getByRole('dialog', { name: 'Generation Library', exact: true })

test.beforeEach(async ({ page, baseURL }) => {
  // Never fall back to the user's running application or an external server.
  expect(baseURL, 'A dedicated test baseURL is required').toBeTruthy()
  const target = new URL(baseURL)
  expect(['127.0.0.1', 'localhost']).toContain(target.hostname)
  expect(target.port).not.toBe('5173')
  await page.route('**/api/message', route => route.abort('blockedbyclient'))
  const sessionResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session')
  await page.goto('/')
  const response = await sessionResponse
  expect(response.ok()).toBe(true)
  const session = await response.json()
  expect(session.providers.anthropic.keySource).toBeNull()
  expect(session.providers.openai.keySource).toBeNull()
  await expect(settingsButton(page)).toHaveAccessibleDescription(/No API key configured/)
})

async function loadStarter(page) {
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await libraryDialog(page).getByRole('button', { name: 'Load Park Apartments starter', exact: true }).click()
  await expect(libraryDialog(page)).not.toBeVisible()
  await expect(page.getByRole('slider', { name: 'Number of Floors', exact: true })).toHaveValue('7')
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
  await expect(page.getByRole('region', { name: '3D workspace', exact: true })).toContainText('A modern apartment building.')
}

async function downloadSource(page) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .js', exact: true }).click()
  const download = await event
  expect(await download.failure()).toBeNull()
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function expectPriorAsset(page, source) {
  await expect(generateButton(page)).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).not.toBeVisible()
  await expect(page.getByRole('slider', { name: 'Number of Floors', exact: true })).toHaveValue('7')
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled()
  await expect(page.getByRole('region', { name: '3D workspace', exact: true })).toContainText('A modern apartment building.')
  // Compare the user-exportable document, including its seed and parameters.
  expect(await downloadSource(page)).toBe(source)
  // Source metadata alone cannot prove that the isolated runtime still works.
  glbTriangleCount((await downloadBytes(page, 'Download GLB')).bytes)
}

async function saveSettings(page, buttonName = 'Save settings') {
  const responseEvent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'POST')
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  const response = await responseEvent
  expect(response.ok()).toBe(true)
  const status = await response.json()
  expect(JSON.stringify(status)).not.toContain(sentinel)
  await expect(page.getByRole('status')).toContainText(buttonName === 'Save settings' ? 'Settings saved' : 'Session key forgotten')
  return { payload: response.request().postDataJSON(), status }
}

async function expectNoStoredKey(page, context) {
  expect(JSON.stringify(await context.storageState({ indexedDB: true }))).not.toContain(sentinel)
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain(sentinel)
}

function expectGenerationPayload(request, prompt) {
  expect(request.method()).toBe('POST')
  expect(request.headers()['x-csrf-token']).toBeTruthy()
  const payload = request.postDataJSON()
  expect(payload.task).toBe('creative')
  expect(payload.messages).toEqual([{ role: 'user', content: prompt }])
  expect(payload.system.length).toBeGreaterThan(0)
  expect(payload.max_tokens).toBe(32000)
  expect(payload).not.toHaveProperty('apiKey')
}

test('fresh user sees an empty Library and can load a generated starter without a key', async ({ page }) => {
  const modelRequests = []
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/message') modelRequests.push(request) })
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(libraryDialog(page)).toContainText('0 saved assets')
  await expect(libraryDialog(page)).toContainText('No generations found')
  await page.getByRole('tab', { name: 'Templates', exact: true }).click()
  await expect(libraryDialog(page)).toContainText('No API key or credits needed.')
  await expect(page.getByRole('button', { name: 'Load Mossy Rocks template', exact: true })).not.toBeVisible()
  await page.getByText('Built-in generators', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Load Mossy Rocks template', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await loadStarter(page)
  expect(await downloadSource(page)).toContain('createAsset')
  await expect(settingsButton(page)).toHaveAccessibleDescription(/No API key configured/)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(libraryDialog(page)).toContainText('0 saved assets')
  await expect(libraryDialog(page)).toContainText('No generations found')
  expect(modelRequests).toHaveLength(0)
})

test('provider session key is masked, survives reload, and can be forgotten without browser storage', async ({ page, context }) => {
  await settingsButton(page).click()
  const provider = page.getByLabel('Provider', { exact: true })
  const key = page.getByLabel('Session API key', { exact: true })
  await provider.selectOption('openai')
  await page.getByLabel('Model ID', { exact: true }).fill('synthetic-test-model')
  await expect(key).toHaveAttribute('type', 'password')
  await key.fill(sentinel)
  const saved = await saveSettings(page)
  expect(saved.payload).toEqual({ provider: 'openai', model: 'synthetic-test-model', apiKey: sentinel })
  expect(saved.status.providers.openai.keySource).toBe('session')
  await expect(key).toHaveValue('')
  await expect(key).toHaveAttribute('placeholder', /^\*+$/)
  await expect(key).toHaveAccessibleDescription(/Key configured/)
  await expect(settingsButton(page)).toHaveAccessibleDescription(/API key configured \(session entry\)/)
  await expectNoStoredKey(page, context)
  const unchanged = await saveSettings(page)
  expect(unchanged.payload).toEqual({ provider: 'openai', model: 'synthetic-test-model' })
  expect(unchanged.status.providers.openai.keySource).toBe('session')
  await provider.selectOption('anthropic')
  await expect(key).toHaveAttribute('placeholder', 'Enter your provider API key')
  await expect(page.getByRole('button', { name: 'Forget session key', exact: true })).not.toBeVisible()
  await provider.selectOption('openai')
  await expect(key).toHaveAttribute('placeholder', /^\*+$/)
  await page.reload()
  await expect(settingsButton(page)).toHaveAccessibleDescription(/API key configured \(session entry\)/)
  await settingsButton(page).click()
  await expect(provider).toHaveValue('openai')
  await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('synthetic-test-model')
  await expect(key).toHaveValue('')
  await expect(key).toHaveAttribute('placeholder', /^\*+$/)
  await expectNoStoredKey(page, context)
  const forgotten = await saveSettings(page, 'Forget session key')
  expect(forgotten.payload).toEqual({ provider: 'openai', model: 'synthetic-test-model', forgetKey: true })
  expect(forgotten.status.providers.openai.keySource).toBeNull()
  await expect(key).toHaveAttribute('placeholder', 'Enter your provider API key')
  await expect(page.getByRole('button', { name: 'Forget session key', exact: true })).not.toBeVisible()
  await page.reload()
  await expect(settingsButton(page)).toHaveAccessibleDescription(/OpenAI: No API key configured/)
  await expectNoStoredKey(page, context)
})

test('missing key gives an actionable error without replacing the prior asset', async ({ page }) => {
  await loadStarter(page)
  const source = await downloadSource(page)
  const requests = []
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/message') requests.push(request) })
  // Exercise the real no-key server rejection; its outbound fetch is disabled.
  await page.unroute('**/api/message')
  const prompt = 'A cluster of mossy rocks'
  await page.getByRole('textbox', { name: 'Describe your asset', exact: true }).fill(prompt)
  const responseEvent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/message' && response.request().method() === 'POST')
  await generateButton(page).click()
  const response = await responseEvent
  expect(response.status()).toBe(401)
  expect(await response.json()).toMatchObject({ code: 'missing_key' })
  await expect(page.getByRole('alert')).toContainText('Add an API key in Model settings')
  await expectPriorAsset(page, source)
  expect(requests).toHaveLength(1)
  expectGenerationPayload(requests[0], prompt)
  await settingsButton(page).click()
  await expect(page.getByLabel('Session API key', { exact: true })).toBeEditable()
})

test('cancelling an in-flight generation restores controls and keeps the prior asset', async ({ page }) => {
  await loadStarter(page)
  const source = await downloadSource(page)
  let heldRoute
  await page.route('**/api/message', route => { heldRoute = route })
  const prompt = 'A tiny blue spaceship'
  await page.getByRole('textbox', { name: 'Describe your asset', exact: true }).fill(prompt)
  await generateButton(page).click()
  await expect.poll(() => Boolean(heldRoute)).toBe(true)
  expectGenerationPayload(heldRoute.request(), prompt)
  await expect(page.getByRole('status').filter({ hasText: 'Waiting for model response' })).toBeVisible()
  await expect(page.getByText('Model request 1 · maximum 3', { exact: true })).toBeVisible()
  // Progress ticking is checked with controlled time in progressClock.spec.js.
  await expect(page.getByRole('timer')).toHaveText(/^Elapsed \d+:[0-5]\d$/)
  await expect(page.getByRole('textbox', { name: 'Describe your asset', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click()
  try {
    // Controls must recover through app cancellation, not our route cleanup.
    await expectPriorAsset(page, source)
    await expect(page.getByRole('textbox', { name: 'Describe your asset', exact: true })).toBeEditable()
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    await heldRoute.abort().catch(() => {})
  }
})

test('provider failure is surfaced once and leaves the prior asset usable', async ({ page }) => {
  await loadStarter(page)
  const source = await downloadSource(page)
  const requests = []
  await page.route('**/api/message', route => {
    requests.push(route.request())
    return route.fulfill({ status: 502, json: { code: 'provider_error', error: 'The provider could not complete the request. Try again later.', retryable: false } })
  })
  const prompt = 'A red lighthouse'
  await page.getByRole('textbox', { name: 'Describe your asset', exact: true }).fill(prompt)
  await generateButton(page).click()
  await expect(page.getByRole('alert')).toContainText('The provider could not complete the request. Try again later.')
  await expectPriorAsset(page, source)
  expect(requests).toHaveLength(1)
  expectGenerationPayload(requests[0], prompt)
})
