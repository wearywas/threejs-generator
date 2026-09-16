// Run with the existing Playwright runtime: node src/components/libraryModals.browser.mjs [dev URL]
// Uses an isolated browser context, the real components, and browser IndexedDB. No API calls.
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const baseURL = process.argv[2] || 'http://127.0.0.1:5173'
const cacheDir = process.env.VITE_TEST_CACHE_DIR || '.vite'
let browser

before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
})
after(async () => { await browser?.close() })

async function fixture(component, props = {}, viewport = { width: 1000, height: 800 }) {
  const page = await browser.newPage({ viewport })
  page.setDefaultTimeout(5000)
  await page.route('**/api/**', route => route.abort())
  await page.route('**/__modal-test__', route => route.fulfill({
    contentType: 'text/html',
    body: `<html><body><button id="opener">Open</button><div id="root"></div>
      <script type="module">
        import RefreshRuntime from '/@react-refresh'
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => type => type
        window.__vite_plugin_react_preamble_installed__ = true
      </script><script type="module" src="/@vite/client"></script></body></html>`
  }))
  await page.goto(`${baseURL}/__modal-test__`)
  await page.waitForLoadState('networkidle')
  await page.evaluate(async ({ component, props, cacheDir }) => {
    const React = (await import(`/node_modules/${cacheDir}/deps/react.js`)).default
    const { createRoot } = (await import(`/node_modules/${cacheDir}/deps/react-dom_client.js`)).default
    const { default: Component } = await import(`/src/components/${component}.jsx`)
    await import('/src/index.css')
    const library = await import('/src/services/generationLibrary.js')
    await library.importLibrary({ version: 2, generations: [{
      id: 'tower', name: 'Stone tower', prompt: 'a stone tower', createdAt: 1,
      mode: 'curated', tags: ['stone'], starred: false, spec: null, code: null,
      schema: null, textureSlots: null, thumbnail: null, family: 'tower'
    }] })
    window.results = { closes: 0, cancellations: 0, settingsOpens: 0, loads: [], imports: [], saves: [], edits: [] }
    window.modalRoot = createRoot(document.getElementById('root'))
    document.getElementById('opener').focus()
    window.modalRoot.render(React.createElement(Component, {
      isOpen: true,
      onClose: () => { window.results.closes++; window.modalRoot.render(null) },
      onCancelRequest: () => { window.results.cancellations++ },
      onLoad: generation => { window.results.loads.push(generation) },
      onImportCode: async (code, name) => { window.results.imports.push({ code, name }); return true },
      onSave: async data => {
        if (window.saveFailure) throw new Error('Storage unavailable')
        window.results.saves.push(data)
      },
      onEdit: prompt => { window.results.edits.push(prompt) },
      onOpenSettings: () => { window.results.settingsOpens++ },
      ...props
    }))
  }, { component, props, cacheDir })
  return page
}

test('library search, type and starred filters have usable accessible names and state', async () => {
  const page = await fixture('GenerationLibrary')
  try {
    await expect(page.getByRole('dialog', { name: 'Generation Library' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close library' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search library' }).fill('not present')
    await expect(page.getByText('No generations found')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search library' }).fill('tower')
    await expect(page.getByRole('button', { name: 'Load Stone tower' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Filter by type' }).selectOption('creative')
    await expect(page.getByText('No generations found')).toBeVisible()
    const starred = page.getByRole('button', { name: 'Starred only', exact: true })
    await starred.click()
    await expect(starred).toHaveAttribute('aria-pressed', 'true')
  } finally { await page.close() }
})

test('Import remains focusable and activates the native picker from the keyboard', async () => {
  const page = await fixture('GenerationLibrary')
  try {
    const input = page.getByLabel('Import', { exact: true })
    await expect(input).toHaveAttribute('accept', '.json,.js,.txt')
    await input.focus()
    await expect(input).toBeFocused()
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    await (await chooser).setFiles({ name: 'tower.js', mimeType: 'text/javascript', buffer: Buffer.from('function createAsset() {}') })
    await expect.poll(() => page.evaluate(() => window.results.imports)).toEqual([
      { name: 'tower.js', code: 'function createAsset() {}' }
    ])
    await expect(input).toHaveValue('')
    const clickChooser = page.waitForEvent('filechooser')
    await page.getByText('Import', { exact: true }).click()
    await (await clickChooser).setFiles([])
  } finally { await page.close() }
})

test('card load, star and delete are keyboard-visible and independent actions', async () => {
  const page = await fixture('GenerationLibrary')
  try {
    const load = page.getByRole('button', { name: 'Load Stone tower', exact: true })
    await load.focus()
    await expect(load).toHaveCSS('opacity', '1')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.results.loads.map(item => item.id))).toEqual(['tower'])
    const star = page.getByRole('button', { name: 'Star Stone tower', exact: true })
    await star.focus()
    await expect(star).toHaveCSS('opacity', '1')
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Unstar Stone tower' })).toHaveAttribute('aria-pressed', 'true')
    const remove = page.getByRole('button', { name: 'Delete Stone tower' })
    await remove.focus()
    await expect(remove).toHaveCSS('opacity', '1')
    page.once('dialog', dialog => dialog.accept())
    await page.keyboard.press('Enter')
    await expect(page.getByText('No generations found')).toBeVisible()
    expect(await page.evaluate(() => window.results.loads.length)).toBe(1)
  } finally { await page.close() }
})

test('save dialog has a close control and restores opener focus after Escape', async () => {
  const page = await fixture('SaveToLibraryModal')
  try {
    await expect(page.getByRole('dialog', { name: 'Save to Library' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close save dialog' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeFocused()
    expect(await page.evaluate(() => window.results.closes)).toBe(1)
  } finally { await page.close() }
})

test('named remove-tag control updates the existing save payload and closes only after success', async () => {
  const page = await fixture('SaveToLibraryModal', { defaultName: 'a stone tower' })
  try {
    await expect(page.getByLabel('Name', { exact: false })).toHaveValue('A Stone Tower')
    await page.getByLabel('Name', { exact: false }).fill('  My tower  ')
    await page.getByLabel('Tags', { exact: false }).fill('stone')
    await page.getByLabel('Tags', { exact: false }).press('Enter')
    await page.getByRole('button', { name: 'Remove tag stone' }).click()
    await page.getByLabel('Tags', { exact: false }).fill('castle')
    await page.getByLabel('Tags', { exact: false }).press('Enter')
    await page.evaluate(() => { window.saveFailure = true })
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Storage unavailable')
    expect(await page.evaluate(() => window.results.closes)).toBe(0)
    await page.evaluate(() => { window.saveFailure = false })
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.results.saves)).toEqual([{ name: 'My tower', customTags: ['castle'] }])
    expect(await page.evaluate(() => window.results.closes)).toBe(1)
  } finally { await page.close() }
})

test('tag entry splits a comma list on Enter instead of collapsing punctuation', async () => {
  const page = await fixture('SaveToLibraryModal')
  try {
    const input = page.getByLabel('Tags', { exact: false })
    await input.fill('rocks, moss, nature')
    await input.press('Enter')
    for (const tag of ['rocks', 'moss', 'nature']) {
      await expect(page.getByRole('button', { name: `Remove tag ${tag}`, exact: true })).toBeVisible()
    }
    await expect(input).toHaveValue('')
  } finally { await page.close() }
})

test('tag paste separates commas and newlines, normalizes duplicates, and keeps keyboard removal working', async () => {
  const page = await fixture('SaveToLibraryModal')
  try {
    const input = page.getByLabel('Tags', { exact: false })
    await input.fill('rocks')
    await input.press(',')
    await input.evaluate(element => {
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', ' Rocks!, MOSS\r\nnature\n\nmoss, !!!')
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
    })
    await expect(input).toHaveValue('')
    await expect(page.getByRole('button', { name: /^Remove tag / })).toHaveCount(3)
    const remove = page.getByRole('button', { name: 'Remove tag moss', exact: true })
    await remove.focus()
    await page.keyboard.press('Enter')
    await input.fill('forest')
    await input.press('Enter')
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.results.saves)).toEqual([
      { name: 'Untitled Asset', customTags: ['rocks', 'nature', 'forest'] }
    ])
  } finally { await page.close() }
})

test('saving includes trailing typed tags without requiring Enter and deduplicates them', async () => {
  const page = await fixture('SaveToLibraryModal')
  try {
    const input = page.getByLabel('Tags', { exact: false })
    await input.fill('moss')
    await input.press('Enter')
    await input.fill('MOSS!, rocks, Nature')
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.results.saves)).toEqual([
      { name: 'Untitled Asset', customTags: ['moss', 'rocks', 'nature'] }
    ])
  } finally { await page.close() }
})

test('tag paste caps at ten unique tags and removal frees a slot for pending save text', async () => {
  const page = await fixture('SaveToLibraryModal')
  try {
    const input = page.getByLabel('Tags', { exact: false })
    await input.evaluate(element => {
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', 'one, TWO, two, three, four, five, six, seven, eight, nine, ten, eleven')
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
    })
    await expect(page.getByRole('button', { name: /^Remove tag / })).toHaveCount(10)
    await expect(input).toBeDisabled()
    await page.getByRole('button', { name: 'Remove tag two', exact: true }).click()
    await expect(input).toBeEnabled()
    await input.fill('replacement, overflow')
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.results.saves)).toEqual([
      { name: 'Untitled Asset', customTags: ['one', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'replacement'] }
    ])
  } finally { await page.close() }
})

test('failed edit exposes its error and keyboard-accessible settings recovery inside the modal', async () => {
  const page = await fixture('EditModal', { error: 'Reconnect your model provider to retry this edit.' })
  try {
    const dialog = page.getByRole('dialog', { name: 'Generative Edit' })
    await expect(dialog.getByRole('alert')).toHaveText('Reconnect your model provider to retry this edit.')
    await expect(dialog.getByRole('alert')).toBeVisible()
    const settings = dialog.getByRole('button', { name: 'Model settings', exact: true })
    await settings.focus()
    await expect(settings).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.results.settingsOpens)).toBe(1)
    expect(await page.evaluate(() => window.results.closes)).toBe(0)
    expect(await page.evaluate(() => window.results.edits)).toEqual([])
  } finally { await page.close() }
})

test('edit error stays readable without an optional settings callback', async () => {
  const page = await fixture('EditModal', { error: 'The edit could not be completed.', onOpenSettings: null })
  try {
    const dialog = page.getByRole('dialog', { name: 'Generative Edit' })
    await expect(dialog.getByRole('alert')).toHaveText('The edit could not be completed.')
    await expect(dialog.getByRole('button', { name: 'Model settings', exact: true })).toHaveCount(0)
  } finally { await page.close() }
})

test('edit does not offer error recovery when there is no error', async () => {
  const page = await fixture('EditModal')
  try {
    const dialog = page.getByRole('dialog', { name: 'Generative Edit' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Model settings', exact: true })).toHaveCount(0)
  } finally { await page.close() }
})

test('edit dismissal while busy cancels the operation instead of closing the modal', async () => {
  const page = await fixture('EditModal', { loading: true })
  try {
    await expect(page.getByRole('dialog', { name: 'Generative Edit' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => window.results.cancellations)).toBe(1)
    await page.getByRole('button', { name: 'Cancel edit request', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.results.cancellations)).toBe(2)
    expect(await page.evaluate(() => window.results.closes)).toBe(0)
  } finally { await page.close() }
})

test('edit still submits trimmed instructions and closes normally when idle', async () => {
  const page = await fixture('EditModal', { loading: false })
  try {
    await page.getByLabel('What would you like to change?').fill('  Add windows  ')
    await page.getByRole('button', { name: 'Apply Edit', exact: true }).click()
    expect(await page.evaluate(() => window.results.edits)).toEqual(['Add windows'])
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => window.results.closes)).toBe(1)
    expect(await page.evaluate(() => window.results.cancellations)).toBe(0)
  } finally { await page.close() }
})

for (const component of ['GenerationLibrary', 'SaveToLibraryModal', 'EditModal']) {
  test(`${component} keeps its surface and controls within a narrow, short viewport`, async () => {
    const page = await fixture(component, { currentPrompt: 'tower '.repeat(40) }, { width: 320, height: 400 })
    try {
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const dimensions = await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
      })
      expect(dimensions.top).toBeGreaterThanOrEqual(0)
      expect(dimensions.bottom).toBeLessThanOrEqual(400)
      expect(dimensions.left).toBeGreaterThanOrEqual(0)
      expect(dimensions.right).toBeLessThanOrEqual(320)
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
    } finally { await page.close() }
  })
}
