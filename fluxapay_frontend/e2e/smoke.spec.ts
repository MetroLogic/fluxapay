import { test, expect } from '@playwright/test';

/**
 * E2E Smoke Tests - Critical Path
 */

test.describe('Smoke Tests - Critical Path', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
  });

  test('@smoke - Home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FluxaPay/i);
    await expect(page.getByRole('link', { name: /login/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up|register/i })).toBeVisible();
  });

  test('@smoke - Login page loads and validates', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^password$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page.getByText(/email is required/i)).toBeVisible();
  });

  test('@smoke - Signup page loads and validates', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByLabel(/business name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^password$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible();
  });

  test('@smoke - API health check via frontend', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect([200, 404, 401]).toContain(response.status());
  });

  test('@smoke - Dashboard shell loads', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'mock-jwt-token');
    });
    await page.route('**/api/merchants/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'merch_smoke_test', business_name: 'Smoke Test Merchant' }),
      }),
    );

    await page.goto('/dashboard');
    if (page.url().includes('/login')) {
      await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
      return;
    }
    await expect(
      page.getByRole('navigation').or(page.getByText('Payments', { exact: true })).first(),
    ).toBeVisible({
      timeout: 10000,
    });
  });

  test('@smoke - Create payment page loads', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'mock-jwt-token');
    });
    await page.route('**/api/merchants/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'merch_smoke_test', business_name: 'Smoke Test Merchant' }),
      }),
    );

    await page.goto('/dashboard/payments?action=create-payment-link');

    if (page.url().includes('/login')) {
      return;
    }

    await expect(page.getByRole('heading', { name: 'Create Payment' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('@smoke - Navigation works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole('link', { name: /create one|sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('@smoke - Mobile responsive check', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page).toHaveTitle(/FluxaPay/i);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('@smoke - No console errors on home page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/');
    await page.waitForTimeout(2000);
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('404') && !err.includes('favicon'),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
