import { defineConfig } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

const buildDirectory = path.join(tmpdir(), `threejs-browser-test-${randomUUID()}`)

export default defineConfig({
  metadata: { buildDirectory },
  globalTeardown: './tests/browser/cleanup.mjs',
  testDir: './tests/browser',
  testMatch: '**/*.spec.js',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5198',
    browserName: 'chromium',
    // Full Chromium uses the same headless rendering path as the desktop browser.
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    // Preserve DOM/source diagnostics without continuous WebGL screen readbacks.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/browser/server.mjs',
    env: { THREEJS_BROWSER_TEST_DIR: buildDirectory },
    url: 'http://127.0.0.1:5198/api/health',
    reuseExistingServer: false,
    timeout: 120000,
  },
})
