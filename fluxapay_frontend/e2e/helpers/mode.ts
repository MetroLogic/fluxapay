/**
 * E2E run mode: `mocked` (default) uses Playwright route intercepts; `real` hits a live backend.
 */

const DEFAULT_FRONTEND_BASE = "http://localhost:3075";
/** Matches `NEXT_PUBLIC_API_URL` default in `src/lib/api.ts` */
const DEFAULT_API_BASE = "http://localhost:3001";

export function isRealMode(): boolean {
  return (process.env.E2E_MODE || "mocked").toLowerCase() === "real";
}

/** Playwright `baseURL`: the Next.js app under test */
export function getBaseUrl(): string {
  return (
    process.env.E2E_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE
  );
}

/** Backend API origin (no trailing slash). Used for cleanup or direct API calls from tests. */
export function getApiUrl(): string {
  return (process.env.E2E_API_URL || DEFAULT_API_BASE).replace(/\/$/, "");
}

export function getTestEmail(): string {
  return process.env.E2E_TEST_EMAIL || "e2e-critical@example.com";
}

export function getTestPassword(): string {
  return process.env.E2E_TEST_PASSWORD || "e2e-password-123";
}

export function getTestOtp(): string {
  return process.env.E2E_TEST_OTP || "123456";
}
