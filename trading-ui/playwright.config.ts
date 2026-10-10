import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for trading-ui end-to-end tests.
 *
 * These tests run against the real running stack: auth service, trade API, and database.
 * Each test is isolated and leaves no shared state behind.
 *
 * Environment variables:
 *   - UI_BASE_URL: The URL where the trading-ui Angular app is served (default: http://localhost:4200)
 *   - AUTH_API_URL: The auth service URL (default: http://localhost:3000)
 *   - TRADE_API_URL: The trade API URL (default: http://localhost:8081)
 *   - TEST_USERNAME: Email address for test login (required)
 *   - TEST_PASSWORD: Password for test login (required)
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.UI_BASE_URL || 'http://localhost:4200',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  /* Disabled: manage the dev server manually since you're running the full stack with docker-compose */
  // webServer: {
  //   command: 'npm start',
  //   url: 'http://localhost:4200',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
