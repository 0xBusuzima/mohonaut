import { defineConfig, devices } from '@playwright/test';

/**
 * Play end-to-end (docs/06 4.3): the game client against a local anvil deployment, with the
 * wallet mock connector standing in for a browser wallet. Needs Foundry; e2e/play/start.mjs
 * deploys, builds and serves. Run: npm run e2e:play
 */
export default defineConfig({
  testDir: 'e2e/play',
  workers: 1,
  timeout: 120_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: 'governance.spec.ts' },
    // Moves the chain four days ahead (the timelock delay), so it runs after the others.
    {
      name: 'governance',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'governance.spec.ts',
      dependencies: ['desktop'],
    },
  ],
  webServer: {
    command: 'node e2e/play/start.mjs',
    url: 'http://127.0.0.1:4174/play/',
    timeout: 600_000,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
});
