import { defineConfig, devices } from '@playwright/test';
import { getBaseUrl } from './e2e/helpers/mode';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /** Retry twice in CI to reduce flakiness; no retries locally. */
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: getBaseUrl(),
    trace: 'on-first-retry',
    /** Capture a screenshot whenever a test fails. */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
