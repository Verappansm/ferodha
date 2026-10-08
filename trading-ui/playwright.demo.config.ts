import { defineConfig, devices } from '@playwright/test';

/**
 * The guided demo (tests/demo). Same stack as the e2e tests, but one browser,
 * one worker, in order.
 *
 *   npm run demo         # on screen, narrated, a video per run in demo-results/
 *   npm run demo:check   # headless, no pauses: a smoke check of every page
 *
 * DEMO_PACE scales the pauses when presenting (default 1; 1.5 is slower).
 */
const screen = { width: 1440, height: 900 };

export default defineConfig({
  testDir: './tests/demo',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'demo-results',
  reporter: [['list']],
  projects: [
    {
      name: 'present',
      use: {
        ...devices['Desktop Chrome'],
        viewport: screen,
        headless: false,
        video: { mode: 'on', size: screen },
        launchOptions: { slowMo: 150 },
      },
    },
    {
      name: 'check',
      use: {
        ...devices['Desktop Chrome'],
        viewport: screen,
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
      },
    },
  ],
});
