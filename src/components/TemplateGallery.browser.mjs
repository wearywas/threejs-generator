// Run with an available Playwright runtime: node src/components/TemplateGallery.browser.mjs
// In-memory gallery fixture, isolated browser profile, no app server or model APIs.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const document = {
  documentVersion: 1, mode: 'procedural', prompt: 'Park Apartments', family: 'building',
  spec: null, code: 'function createAsset() { throw new Error("Do not execute on fetch") }',
  schema: { floors: { type: 'integer', min: 1, max: 8, default: 3 } },
  seed: 42, params: { floors: 4 }, textureSlots: [], textures: {}, restorationNotes: [],
}
const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import TemplateGallery from './TemplateGallery.jsx';
      window.loads = [];
      window.currentAsset = 'previous asset';
      createRoot(document.getElementById('root')).render(React.createElement(TemplateGallery, {
        onLoad: document => { window.loads.push(document); window.currentAsset = document; }
      }));`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    loader: 'jsx',
  },
  bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"development"' },
})
const server = createServer((request, response) => {
  if (request.url === '/gallery.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(bundle.outputFiles[0].text)
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><html><body><div id="root"></div><script src="/gallery.js"></script></body></html>')
  } else { response.writeHead(404); response.end() }
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
let browser
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined })
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  page.setDefaultTimeout(5000)
  const baseURL = `http://127.0.0.1:${server.address().port}`
  const requests = []
  const errors = []
  let pendingRoute
  let responseMode = 'pending'
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== baseURL || url.pathname.startsWith('/api/')) return route.abort()
    if (url.pathname.endsWith('.png')) return route.fulfill({ status: 204, body: '' })
    if (url.pathname.endsWith('.json')) {
      requests.push(url.pathname)
      if (responseMode === 'pending') { pendingRoute = route; return }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(document) })
    }
    return route.continue()
  })
  await page.goto(baseURL)
  await page.waitForLoadState('networkidle')
  expect(requests).toEqual([])
  await expect(page.getByRole('button', { name: / starter$/ })).toHaveCount(3)
  const builtin = page.getByRole('button', { name: 'Load Butterfly Swarm template', includeHidden: true })
  await expect(builtin).not.toBeVisible()
  await page.getByText('Built-in generators', { exact: true }).click()
  await expect(builtin).toBeVisible()

  const starter = page.getByRole('button', { name: 'Load Park Apartments starter' })
  // Two immediate clicks must still produce only one request/load.
  await starter.evaluate(button => { button.click(); button.click() })
  await expect(page.getByRole('status')).toHaveText('Loading starter...')
  await expect(starter).toHaveAttribute('aria-busy', 'true')
  await expect.poll(() => page.locator('button:enabled').count()).toBe(0)
  await expect.poll(() => requests.length).toBe(1)
  expect(await page.evaluate(() => ({ loads: window.loads, current: window.currentAsset }))).toEqual({ loads: [], current: 'previous asset' })
  await pendingRoute.fulfill({ status: 404, body: '' })
  await expect(page.getByRole('alert')).toContainText('Could not load Park Apartments starter: HTTP 404')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(starter).toBeEnabled()
  expect(await page.evaluate(() => window.currentAsset)).toBe('previous asset')
  expect(await page.evaluate(() => window.loads)).toEqual([])

  responseMode = 'success'
  await starter.click()
  await expect.poll(() => page.evaluate(() => window.loads.length)).toBe(1)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => window.currentAsset)).toEqual(document)
  expect(requests).toEqual(['/starters/park-apartments.json', '/starters/park-apartments.json'])
  await builtin.click()
  await expect.poll(() => page.evaluate(() => window.loads.length)).toBe(2)
  expect(await page.evaluate(() => window.currentAsset.spec.generator)).toBe('butterflySwarm')
  expect(requests).toHaveLength(2)
  expect(errors).toEqual([])
  console.log('TemplateGallery: lazy fetch, pending controls, duplicate clicks, error preservation, retry, and built-in load passed')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
