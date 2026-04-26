# Active Tasks

## ✅ [Backend] Implement Oracle Service for Payment Monitoring

**Status**: COMPLETED  
**Date**: April 24, 2026

### Implementation Summary

Implemented a comprehensive Payment Oracle Service that polls the Stellar Horizon API to verify incoming payments with the following features:

#### Core Features
- ✅ Configurable polling service (default: 30 seconds)
- ✅ Batch processing of active payments (default: 50 per batch)
- ✅ Amount and asset code verification (USDC)
- ✅ Smart contract integration (verify_payment) with enable/disable flag
- ✅ Comprehensive error logging and alerting
- ✅ Missed poll detection and tracking
- ✅ Timeout handling for Horizon requests
- ✅ Health monitoring with consecutive failure tracking
- ✅ Detailed metrics collection

#### Files Created
- `src/services/paymentOracle.service.ts` - Main oracle service
- `src/controllers/oracle.controller.ts` - Admin API endpoints
- `src/routes/oracle.route.ts` - RESTful routes
- `src/__tests__/services/paymentOracle.service.test.ts` - Unit tests
- `docs/ORACLE_SERVICE_IMPLEMENTATION.md` - Technical documentation
- `docs/ORACLE_SERVICE_README.md` - Quick start guide

#### Files Modified
- `src/index.ts` - Added oracle startup/shutdown
- `src/app.ts` - Added oracle routes
- `src/config/env.config.ts` - Added oracle configuration
- `.env.example` - Added oracle environment variables

#### API Endpoints
- `GET /api/v1/admin/oracle/metrics` - Get performance metrics
- `GET /api/v1/admin/oracle/health` - Get health status
- `POST /api/v1/admin/oracle/verify/:paymentId` - Manual verification

#### Configuration
```bash
ORACLE_POLLING_INTERVAL_MS=30000
ORACLE_MAX_MISSED_POLLS=5
ORACLE_BATCH_SIZE=50
ORACLE_HORIZON_TIMEOUT_MS=10000
ENABLE_SOROBAN_VERIFICATION=false
```

### Acceptance Criteria Met
✅ Polling service checking Horizon API every X seconds  
✅ Verification of amount and asset code for detected payments  
✅ Smart contract call (verify_payment) on successful detection  
✅ Error logging and alerting for missed blocks/timeouts

---

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
- Add to POST '/' middleware chain: authenticateApiKey, idempotencyMiddleware, validatePayment, createPayment

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

## #211 [Backend] Payments routes: Provide /api/payments/:id/status and /stream endpoints

Status: Completed ✅

### Implementation details
- Added `GET /api/v1/payments/:id/status` (public view)
- Added `GET /api/v1/payments/:id/stream` (SSE stream)
- Updated `EventService` with `PAYMENT_UPDATED` event
- Updated `paymentMonitor.service.ts` and `PaymentService.ts` to emit `PAYMENT_UPDATED`
- Added Swagger documentation for the new endpoints
