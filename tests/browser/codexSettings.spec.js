import { test, expect } from './fixtures.js'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { createApi } from '../../server/api.js'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(45000)

const trigger = page => page.getByRole('button', { name: /^Model settings:/ })
const dialog = page => page.getByRole('dialog', { name: 'Model settings', exact: true })
const provider = page => page.getByLabel('Provider', { exact: true })
const model = page => page.getByLabel('Model', { exact: true })
const save = page => page.getByRole('button', { name: 'Save settings', exact: true })
const allowance = 'Uses your Codex allowance. No separate provider API key is used for this connection. Limits and model access depend on your account.'

async function setup(page, { enabled = true, state = 'not_connected', models = [], defaultModel = '', saved = 'anthropic', url = '/' } = {}) {
  const calls = [], posts = []
  const session = {
    csrfToken: 'synthetic-csrf', provider: saved,
    providers: {
      anthropic: { model: 'claude-fable-5-1', modelOverride: '', keySource: null },
      openai: { model: 'gpt-6-astra', modelOverride: '', keySource: null },
      ...(enabled ? { codex: { model: defaultModel, modelOverride: '', connection: { state, message: '', models, defaultModel } } } : {}),
    },
  }
  const control = { session, calls, posts, authUrl: 'https://auth.openai.com/authorize?state=synthetic', failure: null }
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    calls.push(path)
    if (path === '/api/session') return route.fulfill({ json: session })
    if (path === '/api/message') return route.fulfill({ status: 500, json: { error: 'Unexpected model request in settings test' } })
    if (['/api/settings', '/api/codex/connect', '/api/codex/login'].includes(path)) {
      expect(request.method()).toBe('POST')
      expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf')
      posts.push({ path, body: request.postDataJSON() })
      if (control.failure) return route.fulfill({ status: 503, json: { code: 'unavailable', error: control.failure } })
      if (path === '/api/settings') {
        const body = request.postDataJSON()
        session.provider = body.provider
        session.providers[body.provider].modelOverride = body.model
        session.providers[body.provider].model = body.model || session.providers[body.provider].model
        return route.fulfill({ json: session })
      }
      return route.fulfill({ json: { session, ...(path.endsWith('/login') ? { authUrl: control.authUrl } : {}) } })
    }
    return route.fallback()
  })
  await page.goto(url)
  await expect(trigger(page)).toHaveAccessibleDescription(saved === 'codex' ? /Codex/ : /No API key configured/)
  return control
}

test('initial connection discovery survives React development Strict Mode effect replay', async ({ page }) => {
  // Exercise the real component with development React without a dev server or provider access.
  const bundle = await build({
    stdin: {
      contents: `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client'; import ProviderSettings from './src/components/ProviderSettings.jsx';
        function Harness() { const [open, setOpen] = useState(false); return <ProviderSettings open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} /> }
        createRoot(document.getElementById('root')).render(<React.StrictMode><Harness /></React.StrictMode>);`,
      loader: 'jsx', resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
    },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"development"' },
  })
  await page.route('**/strict-settings-harness', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>${bundle.outputFiles[0].text}</script>` }))
  await setup(page, { url: '/strict-settings-harness' })
  await selectCodex(page)
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled()
})

async function selectCodex(page) {
  await trigger(page).click()
  await expect(provider(page).locator('option[value="codex"]')).toHaveCount(1)
  await provider(page).selectOption('codex')
}

test('feature-disabled settings preserve BYOK and the welcome hint', async ({ page }) => {
  const control = await setup(page, { enabled: false })
  await expect(page.getByText('Requires an OpenAI or Anthropic API key. Usage is billed directly by your provider.')).toBeVisible()
  await trigger(page).click()
  await expect(provider(page).locator('option[value="codex"]')).toHaveCount(0)
  await provider(page).selectOption('openai')
  await page.getByLabel('Model ID', { exact: true }).fill('synthetic-model')
  await page.getByLabel('Session API key', { exact: true }).fill('synthetic-noncredential')
  await save(page).click()
  await expect(dialog(page)).toContainText('Settings saved')
  expect(control.posts).toEqual([{ path: '/api/settings', body: { provider: 'openai', model: 'synthetic-model', apiKey: 'synthetic-noncredential' } }])
  expect(control.calls).not.toContain('/api/message')
})

for (const [state, label] of [
  ['not_connected', 'Not connected'], ['missing', 'Codex CLI missing'], ['incompatible', 'Incompatible Codex connection'],
  ['signed_out', 'Signed out'], ['api_key', 'API-key authentication is incompatible'],
  ['connected', 'Connected: authentication detected'], ['unavailable', 'Connection unavailable'],
]) {
  test(`shows ${state} with explicit actions and no key input`, async ({ page }) => {
    const control = await setup(page, { state })
    await expect(page.getByText(/API key or experimental Codex connection/)).toBeVisible()
    await selectCodex(page)
    await expect(dialog(page)).toContainText(label)
    await expect(dialog(page)).toContainText(allowance)
    await expect(dialog(page)).toContainText('dedicated app profile')
    await expect(page.getByLabel('Session API key', { exact: true })).toHaveCount(0)
    await expect(save(page)).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true })).toHaveCount(state === 'signed_out' ? 1 : 0)
    await expect(page.getByRole('button', { name: state === 'not_connected' ? 'Connect' : 'Refresh connection', exact: true })).toBeEnabled()
    expect(control.posts).toEqual([])
    expect(control.calls).not.toContain('/api/message')
  })
}

test('connect, user-clicked login link, refresh and save preserve the unsaved provider choice', async ({ page, context }) => {
  const control = await setup(page)
  await selectCodex(page)
  control.session.providers.codex.connection.state = 'signed_out'
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(provider(page)).toHaveValue('codex')
  await expect(dialog(page)).toContainText('Signed out')
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).click()
  const link = page.getByRole('link', { name: 'Continue ChatGPT sign-in', exact: true })
  await expect(link).toHaveAttribute('href', control.authUrl)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(context.pages()).toHaveLength(1)
  control.session.providers.codex.connection = { state: 'connected', message: '', models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }, { id: 'other-model', name: 'Other model' }], defaultModel: 'gpt-6-astra' }
  await page.getByRole('button', { name: 'Refresh connection', exact: true }).click()
  await expect(model(page)).toHaveValue('gpt-6-astra')
  await expect(link).toHaveCount(0)
  await expect(dialog(page)).toContainText('Generation not tested')
  await expect(trigger(page)).toHaveAccessibleDescription(/Anthropic: No API key configured/)
  await save(page).click()
  await expect(trigger(page)).toHaveAccessibleDescription(/Codex.*authentication detected.*Generation not tested/)
  expect(control.posts).toEqual([
    { path: '/api/codex/connect', body: {} }, { path: '/api/codex/login', body: {} },
    { path: '/api/codex/connect', body: {} }, { path: '/api/settings', body: { provider: 'codex', model: 'gpt-6-astra' } },
  ])
  expect(control.calls).not.toContain('/api/message')
  expect(JSON.stringify(await context.storageState({ indexedDB: true }))).not.toContain('authorize?state')
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain('authorize?state')
})

test('requires a catalog choice when Astra is absent, keeps it on refresh, and clears an unavailable selection', async ({ page }) => {
  const control = await setup(page, { state: 'connected', models: [{ id: 'other-model', name: 'Other model' }] })
  await selectCodex(page)
  await expect(model(page)).toHaveValue('')
  await expect(model(page)).toContainText('Choose a model')
  await expect(save(page)).toBeDisabled()
  await model(page).selectOption('other-model')
  await page.getByRole('button', { name: 'Refresh connection', exact: true }).click()
  await expect(model(page)).toHaveValue('other-model')
  await expect(save(page)).toBeEnabled()
  control.session.providers.codex.connection.models = [{ id: 'new-model', name: 'New model' }]
  await page.getByRole('button', { name: 'Refresh connection', exact: true }).click()
  await expect(model(page)).toHaveValue('')
  await expect(save(page)).toBeDisabled()
  expect(control.posts.every(post => post.path === '/api/codex/connect')).toBe(true)
})

test('pending sign-in survives refresh, repeated clicks and close, and resumes explicitly after reload', async ({ page, context }) => {
  const control = await setup(page, { state: 'signed_out' })
  await selectCodex(page)
  const signIn = page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true })
  const link = page.getByRole('link', { name: 'Continue ChatGPT sign-in', exact: true })
  await signIn.click()
  await expect(link).toHaveAttribute('href', control.authUrl)
  await page.getByRole('button', { name: 'Refresh connection', exact: true }).click()
  await expect(link).toHaveAttribute('href', control.authUrl)
  // An in-flight repeated explicit login must not temporarily strand the existing link.
  let held
  await page.route('**/api/codex/login', route => { held = route })
  try {
    await signIn.click()
    await expect.poll(() => Boolean(held)).toBe(true)
    await expect(link).toHaveAttribute('href', control.authUrl)
    await held.fulfill({ json: { session: control.session, authUrl: control.authUrl } })
    held = null
    await expect(signIn).toBeEnabled()
  } finally { await held?.abort().catch(() => {}) }
  await page.unroute('**/api/codex/login')
  await page.getByRole('button', { name: 'Close model settings', exact: true }).click()
  await selectCodex(page)
  await expect(link).toHaveAttribute('href', control.authUrl)
  expect(JSON.stringify(await context.storageState({ indexedDB: true }))).not.toContain('authorize?state')
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain('authorize?state')
  const postsBeforeReload = control.posts.length
  await page.reload()
  await selectCodex(page)
  await expect(link).toHaveCount(0)
  expect(control.posts).toHaveLength(postsBeforeReload)
  await signIn.click()
  await expect(link).toHaveAttribute('href', control.authUrl)
  expect(context.pages()).toHaveLength(1)
  expect(control.calls).not.toContain('/api/message')
})

test('Codex provider label fits the desktop column and stacks on small screens', async ({ page }) => {
  await setup(page)
  await selectCodex(page)
  const fit = await provider(page).evaluate(select => {
    const style = getComputedStyle(select)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = style.font
    return { available: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24,
      required: context.measureText(select.selectedOptions[0].text).width }
  })
  expect(fit.available).toBeGreaterThanOrEqual(fit.required)
  const desktopProvider = await provider(page).boundingBox(), desktopModel = await model(page).boundingBox()
  expect(desktopModel.x).toBeGreaterThan(desktopProvider.x + desktopProvider.width)
  expect(desktopModel.y).toBe(desktopProvider.y)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileProvider = await provider(page).boundingBox(), mobileModel = await model(page).boundingBox()
  expect(mobileModel.y).toBeGreaterThan(mobileProvider.y + mobileProvider.height)
  expect(mobileModel.x).toBe(mobileProvider.x)
  expect(mobileProvider.x + mobileProvider.width).toBeLessThanOrEqual(390)
})

test('real API token normalization reaches client request metadata and the settings presentation', async ({ page }) => {
  let usage = { inputTokens: 12, outputTokens: 5 }, cookie = '', providerCalls = 0, adapterCalls = 0
  const connection = { state: 'connected', message: '', models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }], defaultModel: 'gpt-6-astra' }
  const api = createApi({ env: { THREEJS_EXPERIMENTAL_CODEX: '1' },
    requestModel: async () => { providerCalls++; throw new Error('Unexpected provider call') },
    createCodexAdapter: () => ({ status: () => connection, close: async () => {}, generate: async () => {
      adapterCalls++
      return { text: 'Synthetic text, never executed.', provider: 'codex', model: 'gpt-6-astra', requestedModel: 'gpt-6-astra', stopReason: 'completed', usage }
    } }),
  })
  const bundle = await build({ stdin: {
    contents: `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
      import ProviderSettings from './src/components/ProviderSettings.jsx'; import { llmClient } from './src/api/llmClient.js';
      function Harness() { const [open, setOpen] = useState(false); return <><button onClick={async () => {
        await llmClient.saveSettings({ provider: 'codex', model: 'gpt-6-astra' });
        await llmClient.createMessage({ task: 'creative', system: 'Synthetic test', messages: [{ role: 'user', content: 'Synthetic test' }] });
      }}>Report synthetic usage</button><ProviderSettings open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} /></> }
      createRoot(document.getElementById('root')).render(<Harness />);`,
    loader: 'jsx', resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
  }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } })
  await page.route('**/usage-settings-harness', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>${bundle.outputFiles[0].text}</script>` }))
  await page.route('**/api/**', async route => {
    const request = route.request()
    const req = Object.assign(new EventEmitter(), { url: new URL(request.url()).pathname, method: request.method(), socket: { localPort: 5198 },
      headers: { ...request.headers(), host: '127.0.0.1:5198', origin: 'http://127.0.0.1:5198', cookie } })
    const res = Object.assign(new EventEmitter(), { headers: {}, writableEnded: false, destroyed: false,
      setHeader(name, value) { this.headers[name.toLowerCase()] = value },
      writeHead(status, values) { this.status = status; Object.entries(values || {}).forEach(([key, value]) => this.setHeader(key, value)) },
      end(body) { this.body = body; this.writableEnded = true },
    })
    const done = api(req, res)
    queueMicrotask(() => { req.emit('data', Buffer.from(request.postData() || '{}')); req.emit('end') })
    await done
    if (res.headers['set-cookie']) cookie = res.headers['set-cookie'].split(';')[0]
    await route.fulfill({ status: res.status, contentType: 'application/json', body: res.body })
  })
  try {
    await page.goto('/usage-settings-harness')
    await expect(trigger(page)).toHaveAccessibleDescription(/No API key configured/)
    for (const [reported, expected] of [[usage, '12 input, 5 output'], [undefined, '? input, ? output'], [{ inputTokens: 0, outputTokens: 0 }, '0 input, 0 output']]) {
      usage = reported
      await page.getByRole('button', { name: 'Report synthetic usage', exact: true }).click()
      await trigger(page).click()
      await expect(dialog(page)).toContainText(`Tokens: ${expected}.`)
      await page.getByRole('button', { name: 'Close model settings', exact: true }).click()
    }
    expect(adapterCalls).toBe(3)
    expect(providerCalls).toBe(0)
  } finally { await api.close() }
})

test('rejects unsafe login URLs without opening a tab', async ({ page, context }) => {
  const control = await setup(page, { state: 'signed_out' })
  await selectCodex(page)
  for (const url of ['javascript:alert(1)', 'https://auth.openai.com.evil.invalid/authorize', 'https://user@auth.openai.com/authorize', 'http://auth.openai.com/authorize', 'https://auth.openai.com:444/authorize', 'https://auth.openai.com/authorize#', 'https://auth.openai.com/login']) {
    control.authUrl = url
    await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).click()
    await expect(dialog(page).getByRole('alert')).toContainText('valid sign-in link')
    await expect(page.getByRole('link', { name: 'Continue ChatGPT sign-in', exact: true })).toHaveCount(0)
  }
  expect(context.pages()).toHaveLength(1)
})

test('a failed login can be retried without losing the selected provider', async ({ page }) => {
  const control = await setup(page, { state: 'signed_out' })
  await selectCodex(page)
  control.failure = 'Synthetic login failed. Try again.'
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toContainText(control.failure)
  await expect(provider(page)).toHaveValue('codex')
  await expect(page.getByRole('link', { name: 'Continue ChatGPT sign-in', exact: true })).toHaveCount(0)
  control.failure = null
  control.authUrl = 'https://auth0.openai.com/oauth/authorize?state=synthetic'
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Continue ChatGPT sign-in', exact: true })).toHaveAttribute('href', control.authUrl)
  await expect(dialog(page).getByRole('alert')).toHaveCount(0)
  expect(control.calls).not.toContain('/api/message')
})

test('locks the reopened form before input can race its session refresh', async ({ page }) => {
  const control = await setup(page)
  await trigger(page).click()
  await expect(provider(page)).toBeEnabled()
  await page.getByRole('button', { name: 'Close model settings', exact: true }).click()
  let held
  await page.route('**/api/session', route => { held = route })
  try {
    const locked = await page.evaluate(async () => {
      document.querySelector('.model-trigger').click()
      await new Promise(resolve => queueMicrotask(resolve))
      return document.querySelector('#model-provider')?.matches(':disabled')
    })
    expect(locked).toBe(true)
    await expect.poll(() => Boolean(held)).toBe(true)
    await held.fulfill({ json: control.session })
    held = null
    await provider(page).selectOption('openai')
    await save(page).click()
    await expect(trigger(page)).toHaveAccessibleDescription(/OpenAI/)
    expect(control.posts.at(-1).body.provider).toBe('openai')
  } finally { await held?.abort().catch(() => {}) }
})

test('connection and save failures recover, and reopening refreshes status without connecting', async ({ page }) => {
  const control = await setup(page)
  await selectCodex(page)
  control.failure = 'Synthetic connection unavailable. Try again.'
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toContainText(control.failure)
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled()
  control.failure = null
  control.session.providers.codex.connection = { state: 'connected', message: '', models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }], defaultModel: 'gpt-6-astra' }
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(save(page)).toBeEnabled()
  control.failure = 'Synthetic save failure'
  await save(page).click()
  await expect(dialog(page).getByRole('alert')).toContainText(control.failure)
  await expect(trigger(page)).toHaveAccessibleDescription(/Anthropic/)
  control.failure = null
  await save(page).click()
  await expect(trigger(page)).toHaveAccessibleDescription(/authentication detected/)
  await page.getByRole('button', { name: 'Close model settings', exact: true }).click()
  control.session.providers.codex.connection.state = 'signed_out'
  const postCount = control.posts.length, getCount = control.calls.filter(path => path === '/api/session').length
  await trigger(page).click()
  await expect(dialog(page)).toContainText('Signed out')
  await expect(save(page)).toBeDisabled()
  expect(control.calls.filter(path => path === '/api/session').length).toBeGreaterThan(getCount)
  expect(control.posts).toHaveLength(postCount)
})

test('Codex and BYOK both support model actions while local starter controls remain available', async ({ page }) => {
  const control = await setup(page, { state: 'connected', models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }], defaultModel: 'gpt-6-astra' })
  // Keep this settings-only check lightweight; real instancing and animation
  // availability are covered by the isolated-runtime generation flow tests.
  await page.route('**/starters/park-apartments.json', async route => {
    const response = await route.fetch()
    const starter = await response.json()
    starter.code = 'function createAsset(THREE) { const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())); return { root }; }'
    await route.fulfill({ json: starter })
  })
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  await page.getByRole('button', { name: 'Load Park Apartments starter', exact: true }).click()
  const edit = page.getByRole('button', { name: 'AI Edit', exact: true })
  await expect(edit).toBeEnabled()
  await selectCodex(page)
  await expect(edit).toBeEnabled()
  await save(page).click()
  await expect(trigger(page)).toHaveAccessibleDescription(/authentication detected/)
  await page.getByRole('button', { name: 'Close model settings', exact: true }).click()
  await expect(edit).toBeEnabled()
  await expect(edit).toHaveAccessibleDescription(/AI Edit.*Add Animation/)
  await expect(page.getByRole('button', { name: 'Add Animation', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Add Animation', exact: true })).toHaveAccessibleDescription(/Codex allowance/)
  await expect(page.getByText(/AI Edit and Add Animation are unavailable/)).toHaveCount(0)
  await expect(page.getByRole('slider', { name: 'Number of Floors', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Re-run', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Download GLB', exact: true })).toBeEnabled()
  await trigger(page).click()
  await provider(page).selectOption('openai')
  await expect(edit).toBeEnabled()
  await save(page).click()
  await expect(edit).toBeEnabled()
  expect(control.calls).not.toContain('/api/message')
})

test('a login completing during resume clears the old link and can be saved without another login', async ({ page, context }) => {
  const control = await setup(page, { state: 'signed_out' })
  await selectCodex(page)
  const signIn = page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true })
  const link = page.getByRole('link', { name: 'Continue ChatGPT sign-in', exact: true })
  await signIn.click()
  await expect(link).toBeVisible()
  control.session.providers.codex.connection = { state: 'connected', message: '', models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }], defaultModel: 'gpt-6-astra' }
  control.authUrl = undefined
  await signIn.click()
  await expect(link).toHaveCount(0)
  await expect(model(page)).toHaveValue('gpt-6-astra')
  await save(page).click()
  await expect(trigger(page)).toHaveAccessibleDescription(/authentication detected/)
  expect(control.posts.map(post => post.path)).toEqual(['/api/codex/login', '/api/codex/login', '/api/settings'])
  expect(control.calls).not.toContain('/api/message')
  expect(context.pages()).toHaveLength(1)
})
