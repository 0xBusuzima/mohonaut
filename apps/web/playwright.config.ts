import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end and visual tests against the static export. Screenshot baselines come from the
 * official Playwright Linux image in CI (fonts render differently per OS), so visual
 * comparisons run there only; the behaviour checks run everywhere.
 */
export default defineConfig({
  testDir: 'e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://127.0.0.1:4173/design/',
    reuseExistingServer: !process.env.CI,
  },
});
