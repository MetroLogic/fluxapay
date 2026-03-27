import { test, expect } from '@playwright/test';

/**
 * E2E – Signup flow
 * Intercepts POST /api/merchants/signup and POST /api/merchants/verify-otp.
 */
test.describe('Signup flow', () => {
  test('shows validation errors for empty form', async ({ page }) => {
    await page.goto('/en/signup');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test('completes signup and shows OTP step (mocked API)', async ({ page }) => {
    await page.route('**/api/merchants/signup', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Merchant registered. Verify OTP to activate.',
          merchantId: 'mock-id',
        }),
      }),
    );

    await page.goto('/en/signup');

    // Personal & business info
    await page.getByLabel(/full name/i).fill('Test User');
    await page.getByLabel(/business name/i).fill('Test Business');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/phone number/i).fill('+2348000000000');

    // Country — triggers settlement currency + bank country/currency auto-fill
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /nigeria/i }).click();

    // Bank account
    await page.getByLabel(/account name/i).fill('Test User');
    await page.getByLabel(/account number/i).fill('0123456789');
    await page.getByLabel(/bank name/i).fill('First Bank');
    await page.getByLabel(/bank code/i).fill('011');

    // Password
    await page.getByLabel(/password/i).fill('password123');

    await page.getByRole('button', { name: /create account/i }).click();

    // Should transition to OTP step
    await expect(page.getByText(/verify email/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/test@example\.com/i)).toBeVisible();
  });

  test('verifies OTP and completes registration (mocked API)', async ({ page }) => {
    await page.route('**/api/merchants/signup', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Merchant registered. Verify OTP to activate.' }),
      }),
    );

    await page.route('**/api/merchants/verify-otp', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'mock-jwt-token' }),
      }),
    );

    await page.goto('/en/signup');

    await page.getByLabel(/full name/i).fill('Test User');
    await page.getByLabel(/business name/i).fill('Test Business');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/phone number/i).fill('+2348000000000');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /nigeria/i }).click();
    await page.getByLabel(/account name/i).fill('Test User');
    await page.getByLabel(/account number/i).fill('0123456789');
    await page.getByLabel(/bank name/i).fill('First Bank');
    await page.getByLabel(/bank code/i).fill('011');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /create account/i }).click();

    // OTP step
    await expect(page.getByText(/verify email/i)).toBeVisible({ timeout: 5000 });
    await page.getByLabel(/one-time password/i).fill('123456');
    await page.getByRole('button', { name: /^verify$/i }).click();

    await expect(page.getByText(/email verified/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows error for invalid OTP (mocked API)', async ({ page }) => {
    await page.route('**/api/merchants/signup', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Merchant registered. Verify OTP to activate.' }),
      }),
    );

    await page.route('**/api/merchants/verify-otp', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid or expired OTP.' }),
      }),
    );

    await page.goto('/en/signup');

    await page.getByLabel(/full name/i).fill('Test User');
    await page.getByLabel(/business name/i).fill('Test Business');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/phone number/i).fill('+2348000000000');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /nigeria/i }).click();
    await page.getByLabel(/account name/i).fill('Test User');
    await page.getByLabel(/account number/i).fill('0123456789');
    await page.getByLabel(/bank name/i).fill('First Bank');
    await page.getByLabel(/bank code/i).fill('011');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/verify email/i)).toBeVisible({ timeout: 5000 });
    await page.getByLabel(/one-time password/i).fill('000000');
    await page.getByRole('button', { name: /^verify$/i }).click();

    await expect(page.getByText(/invalid or expired otp/i)).toBeVisible({ timeout: 5000 });
  });

  test('can navigate back to signup form from OTP step', async ({ page }) => {
    await page.route('**/api/merchants/signup', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Merchant registered. Verify OTP to activate.' }),
      }),
    );

    await page.goto('/en/signup');

    await page.getByLabel(/full name/i).fill('Test User');
    await page.getByLabel(/business name/i).fill('Test Business');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/phone number/i).fill('+2348000000000');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /nigeria/i }).click();
    await page.getByLabel(/account name/i).fill('Test User');
    await page.getByLabel(/account number/i).fill('0123456789');
    await page.getByLabel(/bank name/i).fill('First Bank');
    await page.getByLabel(/bank code/i).fill('011');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/verify email/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /back to signup/i }).click();

    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });
});
