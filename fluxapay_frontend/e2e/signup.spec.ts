import { test, expect } from '@playwright/test';

/**
 * E2E – Signup flow
 * Uses mocked backend responses via route intercept so no real server is needed.
 */
test.describe('Signup flow', () => {
  test('shows validation errors for empty form', async ({ page }) => {
    await page.goto('/en/signup');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test('completes signup with valid data (mocked API)', async ({ page }) => {
    // Intercept backend calls
    await page.route('**/api/merchants/signup', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Merchant registered. Verify OTP to activate.', merchantId: 'mock-id' }),
      }),
    );

    await page.goto('/en/signup');
    await page.getByLabel(/your name/i).fill('Test User');
    await page.getByLabel(/business name/i).fill('Test Business');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /create account/i }).click();

    // Expect toast or success indicator
    await expect(page.getByText(/signup successful/i)).toBeVisible({ timeout: 5000 });
  });
});
