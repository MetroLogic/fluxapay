with # Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Unauthenticated Request Returns Payment Data (No 401 Guard)
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that `getPaymentById` with `merchantId: undefined` returns 200 instead of 401
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — `merchantId: undefined` with any valid `payment_id`
  - In `fluxapay_backend/src/controllers/__tests__/payment.controller.test.ts`, add a new `describe` block for `getPaymentById`
  - Mock `prisma.payment.findFirst` to return a payment object (simulating a payment exists in DB)
  - Call `getPaymentById` with `req.merchantId = undefined` and a valid `req.params.id`
  - Assert `res.status` was called with `401` — this FAILS on unfixed code (returns 200 instead)
  - Run test: `cd fluxapay_backend && npx jest payment.controller.test.ts --run`
  - **EXPECTED OUTCOME**: Test FAILS (proves the bug — missing 401 guard allows data leak)
  - Document counterexample: `getPaymentById({ merchantId: undefined, params: { id: 'pay_abc' } })` returns 200 with payment data
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Authenticated Merchant-Scoped Request Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code for non-buggy inputs
  - Non-buggy inputs are requests where `isBugCondition` is false: `merchantId` IS defined
  - Observe: `getPaymentById` with `merchantId: 'merchant_1'` and a matching payment → returns 200 with payment data
  - Observe: `getPaymentById` with `merchantId: 'merchant_1'` and Prisma returning `null` → returns 404
  - Observe: `getPaymentById` with `merchantId: 'merchant_1'` and a payment belonging to `merchant_2` (Prisma returns `null` due to `{ id, merchantId }` filter) → returns 404
  - Write property-based tests in `payment.controller.test.ts` covering these three cases across varied `merchantId` and `payment_id` values
  - Run tests on UNFIXED code: `cd fluxapay_backend && npx jest payment.controller.test.ts --run`
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.3_

- [x] 3. Fix for missing merchant-scoped access control on GET /:id

  - [x] 3.1 Register `GET /:id` route with `authenticateToken` middleware
    - In `fluxapay_backend/src/routes/payment.route.ts`, add import for `getPaymentById` from the controller
    - Add `router.get('/:id', authenticateToken, getPaymentById)` after the existing `router.post` line
    - _Bug_Condition: isBugCondition(X) where X.route = "GET /api/payments/:id" AND X.merchantId IS UNDEFINED_
    - _Expected_Behavior: authenticateToken runs before getPaymentById, populating req.merchantId from the JWT_
    - _Preservation: POST / route registration and all other routes remain unchanged_
    - _Requirements: 2.1, 3.1, 3.2, 3.3_

  - [x] 3.2 Add 401 guard in `getPaymentById` controller
    - In `fluxapay_backend/src/controllers/payment.controller.ts`, inside `getPaymentById`, after extracting `merchantId` from `authReq`, add: `if (!merchantId) { return res.status(401).json({ error: "Unauthorized: Merchant ID missing" }); }`
    - Insert this guard BEFORE the `payment_id` extraction and Prisma query
    - The existing Prisma query `{ id: payment_id, merchantId }` and the existing 404 response require no changes
    - _Bug_Condition: isBugCondition(X) where X.merchantId IS UNDEFINED_
    - _Expected_Behavior: returns 401 when merchantId is undefined, never reaches Prisma query_
    - _Preservation: when merchantId is defined, execution continues unchanged to Prisma query and existing 200/404 responses_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Unauthenticated Request Returns 401
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Run: `cd fluxapay_backend && npx jest payment.controller.test.ts --run`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the 401 guard is in place and the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Authenticated Merchant-Scoped Request Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `cd fluxapay_backend && npx jest payment.controller.test.ts --run`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — 200 for own payment, 404 for not f