# Merchant-Scoped Payment Query Bugfix Design

## Overview

`getPaymentById` is reachable without `authenticateToken` middleware because `GET /:id` is not registered in `payment.route.ts`. This means `req.merchantId` is always `undefined` when the controller runs, making the Prisma `{ id, merchantId }` filter ineffective — any caller can retrieve any payment by ID.

The fix is minimal and surgical:
1. Register `GET /:id` with `authenticateToken` in the route file.
2. Add a 401 guard in `getPaymentById` for the case where `merchantId` is still missing post-auth.
3. Preserve the existing `{ id, merchantId }` Prisma filter (already correct).
4. Return 404 when no payment is found (covers both "not found" and "belongs to another merchant").

## Glossary

- **Bug_Condition (C)**: A request reaches `getPaymentById` with `merchantId === undefined`, bypassing merchant-scoped filtering.
- **Property (P)**: For any request where C holds, the endpoint SHALL return 401 (missing auth) or 404 (not found / wrong merchant) — never payment data.
- **Preservation**: All existing behavior for authenticated, correctly-scoped requests and all other payment routes must remain unchanged.
- **authenticateToken**: Middleware in `src/middleware/auth.middleware.ts` that validates a Bearer JWT and attaches `req.user`. Note: it sets `req.user` but does NOT set `req.merchantId` — that must be sourced from `req.user.id` or a separate mechanism.
- **AuthRequest**: Extended Express `Request` type in `src/types/express.ts` that carries `merchantId` and `user` fields.
- **getPaymentById**: Controller in `src/controllers/payment.controller.ts` that queries `prisma.payment.findFirst({ where: { id, merchantId } })`.

## Bug Details

### Bug Condition

The bug manifests when a request hits `GET /api/payments/:id`. Because this route is not registered in `payment.route.ts`, Express never runs `authenticateToken`, so `authReq.merchantId` is `undefined`. The Prisma query `{ id: payment_id, merchantId: undefined }` then ignores the merchant filter entirely.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type PaymentRequest
  OUTPUT: boolean

  RETURN X.route = "GET /api/payments/:id"
     AND X.merchantId IS UNDEFINED
END FUNCTION
```

### Examples

- `GET /api/payments/pay_abc123` with no Authorization header → `merchantId` is `undefined` → Prisma returns the payment for any merchant → 200 with leaked data (expected: 401)
- `GET /api/payments/pay_abc123` with a valid token for merchant B, but the payment belongs to merchant A → `merchantId` is defined but wrong → Prisma returns `null` → 404 (correct behavior once fix is applied; currently leaks if `merchantId` is undefined)
- `GET /api/payments/pay_abc123` with a valid token for the owning merchant → `merchantId` matches → Prisma returns the payment → 200 (must be preserved)
- `GET /api/payments/nonexistent` with a valid token → Prisma returns `null` → 404 (must be preserved)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Authenticated merchants requesting their own payments MUST continue to receive a 200 with full payment details.
- `POST /api/payments` rate limiting and merchant-scoped creation MUST remain unchanged.
- Any route that already uses `authenticateToken` (e.g., `POST /`) MUST continue to behave identically.
- 401 responses for missing/invalid tokens on all protected routes MUST remain unchanged.

**Scope:**
All requests that are NOT `GET /api/payments/:id` are completely unaffected by this fix. Within `GET /api/payments/:id`, only the missing middleware registration and the missing 401 guard are changed — the Prisma query itself is untouched.

## Hypothesized Root Cause

1. **Missing Route Registration**: `payment.route.ts` only registers `POST /` with `authenticateToken`. `GET /:id` was never added, so the route either falls through to a catch-all (returning 404 at the router level) or is handled by a different, unprotected route definition elsewhere in the app. Either way, `authenticateToken` never runs for this path.

2. **`merchantId` Not Set by `authenticateToken`**: The middleware sets `req.user = { id, email }` but does not set `req.merchantId`. The controller reads `authReq.merchantId`, which means something upstream (likely an API key middleware or a separate step) is expected to populate it. If only `authenticateToken` runs and `merchantId` is never populated, the guard added in step 2 of the fix will catch this and return 401.

3. **Silent Prisma Filter Bypass**: Prisma's `findFirst({ where: { id, merchantId: undefined } })` silently drops the `merchantId` condition, returning the first matching payment regardless of merchant. This is the data-leak vector.

## Correctness Properties

Property 1: Bug Condition - Unauthenticated or Unscoped Request Returns No Payment Data

_For any_ request where `isBugCondition` holds (i.e., `GET /api/payments/:id` is reached with `merchantId === undefined`), the fixed `getPaymentById` SHALL return HTTP 401 and MUST NOT include any payment data in the response body.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Authenticated Merchant-Scoped Request Behavior Unchanged

_For any_ request where `isBugCondition` does NOT hold (i.e., `merchantId` is defined and the route is authenticated), the fixed `getPaymentById` SHALL produce the same result as the original function — returning 200 with payment data when the payment belongs to the merchant, and 404 when it does not.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

**File**: `fluxapay_backend/src/routes/payment.route.ts`

**Change 1 — Register the missing route:**
Add `router.get('/:id', authenticateToken, getPaymentById)` and import `getPaymentById` from the controller.

```typescript
import { createPayment, getPaymentById } from '../controllers/payment.controller';
// ...
router.get('/:id', authenticateToken, getPaymentById);
```

---

**File**: `fluxapay_backend/src/controllers/payment.controller.ts`

**Change 2 — Add 401 guard for missing `merchantId`:**
Insert a guard at the top of `getPaymentById` before the Prisma query. This handles the edge case where `authenticateToken` passes but `merchantId` is still not populated (e.g., token lacks the merchant claim).

```typescript
if (!merchantId) {
  return res.status(401).json({ error: "Unauthorized: Merchant ID missing" });
}
```

**Change 3 — Preserve existing Prisma query (no change needed):**
The query `prisma.payment.findFirst({ where: { id: payment_id, merchantId } })` is already correct. Once `merchantId` is always defined (enforced by the guard), this filter correctly scopes results to the authenticated merchant.

**Change 4 — Preserve existing 404 response (no change needed):**
`if (!payment) return res.status(404).json({ error: "Payment not found" })` already handles both "doesn't exist" and "belongs to another merchant" cases correctly.

## Testing Strategy

### Validation Approach

Two-phase approach: first run exploratory tests against the unfixed code to confirm the bug and root cause, then verify the fix satisfies both correctness properties.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating the bug on unfixed code. Confirm that `GET /:id` without auth middleware leaks payment data.

**Test Plan**: Mock `prisma.payment.findFirst` to return a payment object. Call `getPaymentById` directly with a request where `merchantId` is `undefined`. Assert that the response is NOT 200 with payment data — this will fail on unfixed code, confirming the bug.

**Test Cases**:
1. **No Auth Header Test**: Call `getPaymentById` with `merchantId: undefined` and a valid `payment_id` → expect 401 (will return 200 on unfixed code, confirming the leak)
2. **Cross-Merchant Test**: Call `getPaymentById` with `merchantId: undefined` and a payment that belongs to another merchant → expect 401 or 404 (will return 200 on unfixed code)
3. **Route Registration Test**: Verify `GET /:id` is registered in the router with `authenticateToken` (will fail on unfixed route file)

**Expected Counterexamples**:
- `getPaymentById` returns 200 with payment data when `merchantId` is `undefined`
- Root cause confirmed: missing 401 guard + missing route registration

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function returns 401.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := getPaymentById_fixed(X)
  ASSERT result.status = 401
  ASSERT result.body does NOT contain payment fields
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT getPaymentById_original(X) = getPaymentById_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because it generates many combinations of valid `merchantId` values and `payment_id` values, catching edge cases that manual tests miss.

**Test Cases**:
1. **Owned Payment Preservation**: Authenticated merchant requests their own payment → 200 with payment data (same before and after fix)
2. **Not Found Preservation**: Authenticated merchant requests a non-existent payment → 404 (same before and after fix)
3. **Cross-Merchant 404 Preservation**: Authenticated merchant requests a payment belonging to another merchant → 404 (same before and after fix, since `merchantId` is defined and the Prisma filter correctly returns null)

### Unit Tests

- `getPaymentById` with `merchantId: undefined` → 401
- `getPaymentById` with valid `merchantId` and matching payment → 200 with payment data
- `getPaymentById` with valid `merchantId` and non-existent payment → 404
- `getPaymentById` with valid `merchantId` and payment belonging to a different merchant → 404
- Route file registers `GET /:id` with `authenticateToken` middleware

### Property-Based Tests

- Generate random `merchantId` strings and `payment_id` strings; when `merchantId` is defined and Prisma returns a matching payment, response is always 200
- Generate random `merchantId` strings; when Prisma returns `null`, response is always 404
- Generate requests with `merchantId: undefined`; response is always 401 (never 200)

### Integration Tests

- `POST /api/payments` followed by `GET /api/payments/:id` with the same merchant token → 200
- `GET /api/payments/:id` with no Authorization header → 401
- `GET /api/payments/:id` with a valid token for a different merchant → 404
- `GET /api/payments/:id` with an invalid/expired token → 403 (handled by `authenticateToken`)
