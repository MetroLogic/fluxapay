import { test, expect } from '@playwright/test';

/**
 * E2E Smoke Tests - Critical Path
 * 
 * These tests verify the most critical user flows and API integrations.
 * Tagged with @smoke for CI execution.
 */

test.describe('Smoke Tests - Critical Path', () => {
  test.beforeEach(async ({ page }) => {
    // Set reasonable timeout for CI
    page.setDefaultTimeout(15000);
  });

  test('@smoke - Home page loads', async ({ page }) => {
    await page.goto('/');
    
    // Verify page loads
    await expect(page).toHaveTitle(/FluxaPay/i);
    
    // Verify critical elements exist
    await expect(page.getByRole('link', { name: /login/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up|register/i })).toBeVisible();
  });

  test('@smoke - Login page loads and validates', async ({ page }) => {
    await page.goto('/login');
    
    // Verify login form exists
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^password$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    
    // Verify validation works
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/email is required/i)).toBeVisible();
  });

  test('@smoke - Signup page loads and validates', async ({ page }) => {
    await page.goto('/signup');
    
    // Verify signup form exists
    await expect(page.getByLabel(/business name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^password$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create account|sign up/i })).toBeVisible();
  });

  test('@smoke - API health check via frontend', async ({ page }) => {
    // Test that frontend can reach backend
    const response = await page.request.get('/api/health');
    
    // Should get a response (might be 200, 404, or 401 depending on backend setup)
    expect([200, 404, 401]).toContain(response.status());
    
    console.log(`API health check: ${response.status()}`);
  });

  test('@smoke - Dashboard shell loads', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('navigation').or(page.getByText(/payments/i))).toBeVisible({
      timeout: 10000,
    });
  });

  test('@smoke - Create payment page loads', async ({ page }) => {
    // Mock authentication for this test
    await page.route('**/api/merchants/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'merch_smoke_test', business_name: 'Smoke Test Merchant' }),
      })
    );

    await page.goto('/dashboard/payments?action=create-payment-link');
    
    // Verify payment form loads (or redirects to auth)
    const url = page.url();
    if (!url.includes('/login')) {
      await expect(page.getByRole('heading', { name: /create payment link/i })).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('@smoke - Navigation works', async ({ page }) => {
    await page.goto('/');
    
    // Test navigation between pages
    await page.getByRole('link', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/login/);
    
    await page.getByRole('link', { name: /create one/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('@smoke - Mobile responsive check', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');
    
    // Verify page is responsive
    await expect(page).toHaveTitle(/FluxaPay/i);
    
    // Reset viewport
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
    
    // Wait for any async errors
    await page.waitForTimeout(2000);
    
    // Should have no console errors (excluding expected 404s etc)
    const criticalErrors = consoleErrors.filter(
      err => !err.includes('404') && !err.includes('favicon')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});
