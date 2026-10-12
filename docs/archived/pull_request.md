# [Backend] HD Wallet · [DevOps] Canary Deploy · [SDK] Python & Go SDKs

Closes #369 · Closes #378 · Closes #383 · Closes #384

## Summary

This PR implements four issues in a single branch:

1. **#369** — Completes the HD Wallet & Stellar account logic with a balance helper
2. **#378** — Configures a canary deployment flow with staging gate and automatic rollback
3. **#383** — Ships a native Python SDK (sync + async, PyPI-ready)
4. **#384** — Ships a native Go SDK (typed structs, context support, `go get` compatible)

---

## #369 — HD Wallet & Stellar Account Logic

The BIP44 key derivation, trustline automation, and AES-256-GCM encryption of child keys were already implemented. This PR adds the remaining acceptance criterion — a balance helper.

**`fluxapay_backend/src/services/StellarService.ts`**
- Added `getAccountBalance(publicKey): Promise<number>` — returns the USDC balance for any Stellar address; returns `0` gracefully for accounts that don't exist or have no USDC trustline

**`fluxapay_backend/src/services/__tests__/StellarService.test.ts`**
- 3 new tests: USDC balance present, no trustline (returns 0), account 404 (returns 0)

All acceptance criteria met:
- ✅ Secure BIP44 child key derivation from master seed (`HDWalletService`)
- ✅ Automated trustline creation for new accounts (`StellarService.prepareAccount`)
- ✅ AES-256-GCM encryption of child key indices at rest (`HDWalletService.encryptKeyData`)
- ✅ Balance helper for checking USDC on any Stellar account (`StellarService.getAccountBalance`)

---

## #378 — Canary Deployment Flow

**`.github/workflows/canary-deploy.yml`** — 3-stage pipeline on every push to `main`:

| Stage | Job | Behaviour |
|-------|-----|-----------|
| 1 | `deploy-staging` | Builds image and deploys to staging environment |
| 2 | `integration-tests-staging` | Runs full unit + contract + smoke tests against staging |
| 3 | `deploy-production` | Only runs if stage 2 passes |
| — | `rollback-staging` | Auto-triggered (`if: failure()`) — reverts staging, production is never touched |

**`docker-compose.staging.yml`** — staging environment identical to production topology (postgres + backend), all secrets injected via env vars.

All acceptance criteria met:
- ✅ Staging environment mirrors production
- ✅ Integration tests run against staging before production push
- ✅ Automatic rollback if staging tests fail

---

## #383 — Python SDK

**`fluxapay_python_sdk/fluxapay/__init__.py`**
- `FluxaPay` — synchronous client (context manager support)
- `AsyncFluxaPay` — async client via `httpx` (async context manager support)
- Resources on both clients: `payments` (create, get, get_status, list) and `settlements` (list, get, summary)
- `verify_webhook_signature()` — standalone HMAC-SHA256 helper with replay-protection
- Typed dataclasses: `Payment`, `PaymentStatus`, `Invoice`, `WebhookEvent`, `FluxaPayError`

**`fluxapay_python_sdk/pyproject.toml`** — PyPI-ready (`pip install fluxapay`), requires Python ≥ 3.9, single runtime dependency (`httpx`)

**`fluxapay_python_sdk/tests/test_sdk.py`** — 12 tests, all passing ✅

All acceptance criteria met:
- ✅ Client class for Payment and Settlement resources
- ✅ Synchronous (`FluxaPay`) and asynchronous (`AsyncFluxaPay`) support
- ✅ PyPI package ready for distribution (`pyproject.toml` + `python -m build`)

---

## #384 — Go SDK

**`fluxapay_go_sdk/fluxapay/client.go`**
- `Client` with functional options: `WithBaseURL`, `WithHTTPClient`
- `PaymentsResource` — `Create`, `Get`, `GetStatus`, `List` (all accept `context.Context`)
- `SettlementsResource` — `List`, `Get`, `Summary`
- `WebhooksResource` — `Verify` (HMAC-SHA256 + replay-protection), `Parse`
- Typed structs: `Payment`, `PaymentStatus`, `PaymentList`, `Settlement`, `SettlementList`, `WebhookEvent`, `CreatePaymentParams`, `ListPaymentsParams`, `ListSettlementsParams`
- `*Error` type with `StatusCode`, `Message`, `Raw` fields

**`fluxapay_go_sdk/go.mod`** — module path `github.com/MetroLogic/fluxapay/fluxapay_go_sdk`

**`fluxapay_go_sdk/fluxapay/client_test.go`** — 10 tests using `httptest.Server`

All acceptance criteria met:
- ✅ Typed structs for all API resources
- ✅ `context.Context` support on every request
- ✅ `go get github.com/MetroLogic/fluxapay/fluxapay_go_sdk` compatible module

---

## CI

**`.github/workflows/sdk-release-python-go.yml`** — release workflow:
- Tag `python-sdk-vX.Y.Z` → runs tests → publishes to PyPI via `pypa/gh-action-pypi-publish`
- Tag `go-sdk-vX.Y.Z` → runs `go vet`, `go test ./...`, `go build ./...`

---

## Files Changed

| File | Status |
|------|--------|
| `fluxapay_backend/src/services/StellarService.ts` | Modified |
| `fluxapay_backend/src/services/__tests__/StellarService.test.ts` | Modified |
| `.github/workflows/canary-deploy.yml` | New |
| `docker-compose.staging.yml` | New |
| `fluxapay_python_sdk/fluxapay/__init__.py` | New |
| `fluxapay_python_sdk/pyproject.toml` | New |
| `fluxapay_python_sdk/tests/test_sdk.py` | New |
| `fluxapay_python_sdk/README.md` | New |
| `fluxapay_go_sdk/fluxapay/client.go` | New |
| `fluxapay_go_sdk/fluxapay/client_test.go` | New |
| `fluxapay_go_sdk/go.mod` | New |
| `fluxapay_go_sdk/README.md` | New |
| `.github/workflows/sdk-release-python-go.yml` | New |
