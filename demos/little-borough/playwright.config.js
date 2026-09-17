import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  // Software-rendered CI takes multiple seconds per real pointer/keyboard event.
  timeout: process.env.CI ? 180_000 : 60_000,
  expect: { timeout: 10_000 },
  use: {
    channel: 'chromium',
    baseURL: 'http://127.0.0.1:5200',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'npm run dev -- --port 5200', url: 'http://127.0.0.1:5200', reuseExistingServer: false, timeout: 30_000 },
});
