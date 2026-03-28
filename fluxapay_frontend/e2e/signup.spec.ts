import { test, expect } from '@playwright/test';

/**
 * E2E – Signup flow
 * Uses mocked backend responses via route intercept so no real server is needed.
 */
test.describe('Signup flow', () => {
  test('shows validation errors for empty form', async ({ page }) => {
    await page.goto('/signup');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText('Name is required', { exact: true })).toBeVisible();
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

    await page.goto('/signup');
    await page.getByPlaceholder('Your name').fill('Test User');
    await page.getByPlaceholder('Business name').fill('Test Business');
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByText('Select Country', { exact: true }).click();
    await page.getByRole('option', { name: /nigeria/i }).click();
    await page.getByPlaceholder('Bank Name').fill('Test Bank');
    await page.getByPlaceholder('Bank Code').fill('001');
    await page.getByPlaceholder('Account Number').fill('1234567890');
    await page.getByPlaceholder('Password').fill('password123');
    await page.getByRole('button', { name: /create account/i }).click();

    // Expect toast or success indicator
    await expect(page.getByText(/signup successful/i).first()).toBeVisible({ timeout: 5000 });
  });
});
