import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { channel: 'chromium', baseURL: 'http://127.0.0.1:5200', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run dev -- --port 5200', url: 'http://127.0.0.1:5200', reuseExistingServer: false, timeout: 30_000 },
});
