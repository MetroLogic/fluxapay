# End-to-end tests (Playwright)

## Modes

| Variable | Values | Purpose |
|----------|--------|---------|
| `E2E_MODE` | `mocked` (default), `real` | Mocked uses `page.route` intercepts; real sends API traffic to your backend. |
| `E2E_BASE_URL` | e.g. `http://localhost:3075` | Playwright `baseURL` (the Next.js app). Falls back to `PLAYWRIGHT_BASE_URL`, then `http://localhost:3075`. |
| `E2E_API_URL` | e.g. `http://localhost:3001` | Backend origin for helpers and cleanup. Default matches `NEXT_PUBLIC_API_URL` fallback in `src/lib/api.ts`. |

## Credentials (real mode)

| Variable | Description |
|----------|-------------|
| `E2E_TEST_EMAIL` | Merchant email for signup/login steps. |
| `E2E_TEST_PASSWORD` | Merchant password. |
| `E2E_TEST_OTP` | Six-digit code typed during OTP verification. |

### Fixed OTP and the backend

In real mode the UI submits whatever you set as `E2E_TEST_OTP`. For that to succeed, configure the backend with **`E2E_ACCEPT_OTP`** set to the **same** value (see `fluxapay_backend/.env.example`). That bypass is only intended for automation; do not enable it in production.

## Running locally

**Mocked (default)** — no backend required for most specs; start the app, then:

```bash
cd fluxapay_frontend
npm run dev
# other terminal:
npm run test:e2e
```

**Real** — start Postgres + `fluxapay_backend`, set `NEXT_PUBLIC_API_URL` (and optionally `E2E_API_URL`) to the backend origin, start Next on `E2E_BASE_URL`, then:

```bash
export E2E_MODE=real
export E2E_TEST_EMAIL=...
export E2E_TEST_PASSWORD=...
export E2E_TEST_OTP=123456
# Backend must have E2E_ACCEPT_OTP=123456
npm run test:e2e
```

Note: the merchant API paths and signup payload in the frontend must match your backend contract for the full real critical path to succeed. Until then, rely on **mocked** mode for green runs; the GitHub Actions **real** matrix leg is allowed to fail without failing the workflow (see below).

## Critical path suite

`e2e/critical-path.spec.ts` runs one `@critical` flow: signup → OTP → login → create payment link → checkout (pending) → confirmation. Blockchain/webhook confirmation is **mocked** via the checkout status route in mocked mode, as allowed by the product issue.

Run only that test:

```bash
npx playwright test -g @critical
```

## Helpers

- `e2e/helpers/mode.ts` — `isRealMode()`, `getBaseUrl()`, `getApiUrl()`, credential getters.
- `e2e/helpers/mocks.ts` — `setupMocks(page, register)` skips intercept registration when `E2E_MODE=real`.

## CI matrix

`.github/workflows/frontend-ci.yml` runs E2E with `strategy.matrix.e2e_mode: [mocked, real]` and `fail-fast: false`.

- **mocked**: Same as before — build Next, `npm start`, `wait-on` port 3075, `npm run test:e2e` with `PLAYWRIGHT_BASE_URL` / `E2E_BASE_URL` set.
- **real**: Starts `docker-compose.ci.yml` (Postgres + backend), waits for `http://127.0.0.1:3000/health`, passes `NEXT_PUBLIC_API_URL` / `E2E_API_URL` for the build and run, sets `E2E_ACCEPT_OTP` on the backend from the `E2E_TEST_OTP` secret, and runs the same test command. The test step uses `continue-on-error: true` so a failing real leg does not fail the whole workflow while the stack is still being aligned.

Configure repository secrets (optional but required for meaningful real runs): `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `E2E_TEST_OTP`.

## Cleanup (optional, real mode)

If you set `E2E_CLEANUP_MERCHANT_ID` and `E2E_ADMIN_SECRET` (same value the backend expects for `X-Admin-Secret`), the suite attempts a best-effort admin status update after the run.
