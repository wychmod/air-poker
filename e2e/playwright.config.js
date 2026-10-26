import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { ROOT } from '../scripts/harness/config.js';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 45_000,
  globalTimeout: 300_000,
  expect: { timeout: 5000 },
  outputDir: '../output/e2e/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(ROOT, 'output/e2e/report'), open: 'never' }],
    ['json', { outputFile: resolve(ROOT, 'output/e2e/results.json') }],
  ],
  use: {
    browserName: 'chromium',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'phone-390-root',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 390, height: 844 },
        defaultBrowserType: 'chromium',
        baseURL: 'http://127.0.0.1:4185/',
      },
    },
    {
      name: 'phone-320-subpath',
      use: {
        viewport: { width: 320, height: 844 },
        isMobile: true,
        hasTouch: true,
        baseURL: 'http://127.0.0.1:4185/air-poker/',
      },
    },
    {
      name: 'desktop-subpath',
      use: { viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:4185/air-poker/' },
    },
  ],
  webServer: {
    command: 'node scripts/serve-e2e.js',
    cwd: ROOT,
    url: 'http://127.0.0.1:4185/',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
