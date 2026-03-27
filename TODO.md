# Active Tasks

## #213 [DONE - pending migration]
... (previous content)

## #216 [Backend] Payment statuses: Standardize enum

Status: In Progress

### Steps

1. Add PaymentStatus enum to prisma/schema.prisma
2. Update Payment.status field
3. Update frontend types/payment.ts
4. Create docs/PAYMENT_LIFECYCLE.md
5. Prisma migrate
6. Verify

Next step: 1/6

Status: In Progress

## Steps

### 1. Add IdempotencyRecord model to Prisma schema
- Edit `fluxapay_backend/prisma/schema.prisma`
- Add model with fields: idempotency_key (PK), user_id?, request_hash, response_code Int, response_body Json, timestamps.

### 2. Update payment routes with idempotency middleware
- Edit `fluxapay_backend/src/routes/payment.route.ts`
- Import idempotencyMiddleware
- Add to POST '/' middleware chain: authenticateToken, idempotencyMiddleware, validatePayment, createPayment

### 3. Generate and run Prisma migration
- cd fluxapay_backend
- npx prisma generate
- npx prisma migrate dev --name add_idempotency_record

### 4. Verify metadata optional (already handled)
- Test createPayment without metadata → defaults to {}

### 5. Add/update tests for idempotency
- Update `fluxapay_backend/src/services/__tests__/payment.service.test.ts` or add controller test

### 6. Test end-to-end
- Create payment with/without Idempotency-Key twice
- Confirm repeat returns same payment

### 7. Commit changes

✅ 1/7 Complete: Added IdempotencyRecord model to schema.prisma

✅ 1/7 Complete.

✅ 2/7 Complete: Added idempotencyMiddleware to payment routes.

⚠️ 3/7 Manual: Prisma migration ready (run `cd fluxapay_backend && npx prisma migrate dev --name add_idempotency_record` when DB at localhost:5432 is up)

✅ 4/7 Metadata optional verified (already in validator/service)

Next step: 5/7
