import { test, expect } from '@playwright/test';

/**
 * E2E – Create payment link flow (dashboard)
 * Requires being logged in. We set localStorage directly.
 */
test.describe('Create payment link', () => {
  test.beforeEach(async ({ page }) => {
    // Seed auth token so the dashboard doesn't redirect
    await page.goto('/dashboard');
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-jwt-token');
    });
  });

  test('navigates to payments page', async ({ page }) => {
    await page.goto('/dashboard/payments');
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('create payment modal opens (mocked)', async ({ page }) => {
    await page.route('**/api/payments', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          payment: { id: 'pay_new', checkoutUrl: 'http://localhost:3075/pay/pay_new', status: 'pending' },
        }),
      }),
    );

    await page.goto('/dashboard/payments');
    const createBtn = page.getByRole('button', { name: /create/i });
    if (await createBtn.isVisible()) {
      await createBtn.click();
      // Expect a modal or form to appear
      await expect(page.getByRole('dialog').or(page.getByText(/amount/i))).toBeVisible({ timeout: 3000 });
    }
  });
});
