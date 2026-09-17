import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/browser.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 8000 },
  use: {
    // Full Chromium's new headless mode avoids headless-shell WebGL stalls.
    channel: 'chromium',
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: false,
  },
});
