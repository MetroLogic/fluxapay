import { test, expect } from '@playwright/test';

/**
 * E2E – Login flow
 */
test.describe('Login flow', () => {
  test('shows validation error for empty fields', async ({ page }) => {
    await page.goto('/en/login');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/email is required/i)).toBeVisible();
  });

  test('shows error for invalid credentials (mocked API)', async ({ page }) => {
    await page.route('**/api/merchants/login', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid credentials' }),
      }),
    );

    await page.goto('/en/login');
    await page.getByLabel(/email/i).fill('bad@example.com');
    await page.getByLabel(/password/i).fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 5000 });
  });

  test('redirects to dashboard on successful login (mocked API)', async ({ page }) => {
    await page.route('**/api/merchants/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'mock-jwt-token', merchant: { id: 'mer_1', business_name: 'Test Biz' } }),
      }),
    );

    await page.goto('/en/login');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for dashboard redirect
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });
});
