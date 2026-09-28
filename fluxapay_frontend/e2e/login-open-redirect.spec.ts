import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mocks';

/**
 * Open redirect on the login form (#954).
 *
 * `?redirect=` is attacker-controlled, so what matters is where the browser is
 * *sent* after a successful login. We assert on document requests rather than
 * the settled URL: middleware bounces /dashboard straight back to /login
 * because login stores its token in localStorage while the edge guard reads a
 * cookie, so the final URL hides the navigation we actually care about.
 */
function futureJwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'mer_e2e', exp })}.sig`;
}

/** Built from char codes so no source-escaping layer can silently drop the backslash. */
const BACKSLASH = String.fromCharCode(92);
const HOSTILE: Array<{ label: string; value: string }> = [
  { label: 'absolute url', value: 'https://evil.com' },
  { label: 'protocol-relative', value: '//evil.com/steal' },
  { label: 'backslash authority', value: '/' + BACKSLASH + 'evil.com' },
  { label: 'backslash double', value: BACKSLASH + BACKSLASH + 'evil.com' },
];

async function mockLogin(page: import('@playwright/test').Page) {
  await setupMocks(page, async (p) => {
    await p.route('**/api/merchants/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'ok', merchantId: 'mer_e2e', token: futureJwt() }),
      })
    );
  });
}

async function submitLogin(page: import('@playwright/test').Page, redirect: string) {
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByPlaceholder('test@gmail.com').fill('victim@example.com');
  await page.getByPlaceholder('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /^login$/i }).click();
  await page.waitForTimeout(5000);
}

// Skipped until the login page is reachable again: `/login` currently 500s
// (OfflineBanner calls useTranslations above NextIntlClientProvider) and
// LoginForm never unwraps the `Result` from api.auth.login, so a login can
// never succeed. Both are pre-existing on main and unrelated to #954. Verified
// locally with those two patched: passes with the fix, and all four hostile
// cases navigate to evil.com without it. The unit tests in
// src/lib/__tests__/safeRedirect.test.ts are the enforceable guard meanwhile.
test.describe.skip('Login redirect validation', () => {
  for (const { label, value } of HOSTILE) {
    test(`never leaves origin for ${label}`, async ({ page }) => {
      const documents: string[] = [];
      page.on('request', (r) => {
        if (r.resourceType() === 'document') documents.push(r.url());
      });

      await mockLogin(page);
      await submitLogin(page, value);

      const offOrigin = documents.filter((u) => !u.startsWith('http://localhost:3075'));
      expect(offOrigin, `navigated off origin: ${offOrigin.join(', ')}`).toEqual([]);
      expect(documents.some((u) => u.includes('/dashboard'))).toBe(true);
    });
  }

  test('still honours a legitimate relative redirect', async ({ page }) => {
    const documents: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'document') documents.push(r.url());
    });

    await mockLogin(page);
    await submitLogin(page, '/dashboard/settings');

    expect(documents.some((u) => u.includes('/dashboard/settings'))).toBe(true);
    expect(documents.filter((u) => !u.startsWith('http://localhost:3075'))).toEqual([]);
  });
});
