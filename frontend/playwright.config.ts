import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,

  // Retry flaky tests: 2 times on CI, 1 time locally (#154)
  retries: process.env.CI ? 2 : 1,

  // Limit parallelism on CI to reduce resource contention
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'html',

  use: {
    baseURL: 'http://localhost:5173',

    // Collect trace on first retry to aid flakiness debugging
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on first retry
    video: 'on-first-retry',

    // Global action timeout – replaces magic numbers in tests (#154)
    actionTimeout: 10_000,

    // Global navigation timeout
    navigationTimeout: 30_000,
  },

  // Global test timeout
  timeout: 60_000,

  // Expect timeout (used by all `expect()` assertions)
  expect: {
    timeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
