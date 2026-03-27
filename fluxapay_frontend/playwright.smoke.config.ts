import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for CI smoke tests
 * Runs a minimal subset of E2E tests for quick feedback
 */
export default defineConfig({
  testDir: './e2e',
  
  // Only run smoke tests in CI
  grep: /@smoke/,
  
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Sequential for CI stability
  reporter: process.env.CI ? [['github'], ['html', { outputFolder: 'playwright-report' }]] : 'list',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3075',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results/',

  webServer: {
    command: 'npm start',
    url: 'http://localhost:3075',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
