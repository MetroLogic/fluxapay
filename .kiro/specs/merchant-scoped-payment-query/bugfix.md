# Bugfix Requirements Document

## Introduction

The `getPaymentById` endpoint lacks merchant-scoped access control because it is not registered as a route with `authenticateToken` middleware. As a result, `authReq.merchantId` is undefined at query time, meaning the Prisma query cannot filter by merchant — allowing any caller to potentially retrieve any payment by ID. This is a security vulnerability that must be fixed by registering the route with auth middleware and ensuring the query is always scoped to the authenticated merchant.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a request is made to retrieve a payment by ID and the route is not registered with `authenticateToken` middleware THEN the system processes the request with `merchantId` as `undefined`, bypassing merchant-scoped filtering

1.2 WHEN `merchantId` is `undefined` in the Prisma query `{ id: payment_id, merchantId: undefined }` THEN the system may return a payment belonging to any merchant, leaking cross-merchant data

1.3 WHEN an unauthenticated or cross-merchant request is made to retrieve a payment by ID THEN the system does not enforce ownership, allowing unauthorized access to payment details

### Expected Behavior (Correct)

2.1 WHEN a request is made to retrieve a payment by ID THEN the system SHALL require a valid bearer token via `authenticateToken` middleware before processing the request

2.2 WHEN a valid token is present and `merchantId` is extracted from the auth context THEN the system SHALL query the payment using both `id` and `merchantId` to enforce merchant-scoped access

2.3 WHEN the requested payment ID does not belong to the authenticated merchant THEN the system SHALL return a 404 response without revealing whether the payment exists for another merchant

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an authenticated merchant requests a payment that belongs to them THEN the system SHALL CONTINUE TO return the full payment details with a 200 response

3.2 WHEN an authenticated merchant creates a payment via `POST /api/payments` THEN the system SHALL CONTINUE TO enforce rate limiting and merchant-scoped creation as before

3.3 WHEN a request is made without a valid bearer token to any protected payment route THEN the system SHALL CONTINUE TO return a 401 response

---

## Bug Condition

**Bug Condition Function:**

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PaymentRequest
  OUTPUT: boolean

  // Bug is triggered when the GET /:id route is reached without auth middleware,
  // causing merchantId to be undefined in the controller
  RETURN X.route = "GET /api/payments/:id"
     AND X.merchantId IS UNDEFINED
END FUNCTION
```

**Property: Fix Checking**

```pascal
FOR ALL X WHERE isBugCondition(X) DO
  result ← getPaymentById'(X)
  ASSERT result.status = 401 OR result.status = 404
  ASSERT result does NOT contain payment data from another merchant
END FOR
```

**Property: Preservation Checking**

```pascal
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT getPaymentById(X) = getPaymentById'(X)
END FOR
```
