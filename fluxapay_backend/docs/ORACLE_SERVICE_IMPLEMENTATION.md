# Payment Oracle Service Implementation

**Status**: ✅ Implemented  
**Date**: April 24, 2026  
**Feature**: Backend Oracle Service for Payment Monitoring

---

## Overview

The Payment Oracle Service is a background service that continuously polls the Stellar Horizon API to verify incoming payments. It provides robust payment detection, verification, and smart contract integration with comprehensive error handling and monitoring.

## Architecture

### Core Components

1. **PaymentOracleService** (`src/services/paymentOracle.service.ts`)
   - Main oracle polling loop
   - Payment verification logic
   - Smart contract integration
   - Error handling and recovery
   - Metrics collection

2. **OracleController** (`src/controllers/oracle.controller.ts`)
   - Admin API endpoints
   - Manual verification triggers
   - Metrics and health monitoring

3. **Oracle Routes** (`src/routes/oracle.route.ts`)
   - RESTful API endpoints
   - Authentication and authorization
   - Swagger documentation

## Features

### 1. Configurable Polling

The oracle service polls Horizon API at configurable intervals:

```bash
# Environment Variables
ORACLE_POLLING_INTERVAL_MS=30000        # Poll every 30 seconds (default)
ORACLE_BATCH_SIZE=50                    # Process 50 payments per batch
ORACLE_HORIZON_TIMEOUT_MS=10000         # 10 second timeout for Horizon requests
ORACLE_MAX_MISSED_POLLS=5               # Alert after 5 consecutive failures
```

### 2. Payment Verification

For each active payment, the oracle:

1. **Checks Horizon API** for incoming transactions
2. **Verifies amount** matches expected payment amount
3. **Verifies asset code** (USDC) and issuer
4. **Tracks paging tokens** to avoid re-processing transactions
5. **Updates payment status**:
   - `confirmed` - Full amount received
   - `overpaid` - More than expected amount
   - `partially_paid` - Partial payment received
   - `failed` - Verification failed

### 3. Smart Contract Integration

When enabled, the oracle calls Soroban smart contracts to verify payments on-chain:

```bash
ENABLE_SOROBAN_VERIFICATION=true        # Enable smart contract verification
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
PAYMENT_CONTRACT_ID=C...                # Payment verification contract
```

The `verify_payment` smart contract function is called with:
- Payment ID
- Transaction hash
- Amount received
- Asset code

### 4. Error Handling & Alerting

#### Missed Block Detection

The oracle tracks polling intervals and detects missed polls:

```typescript
if (timeSinceLastPoll > expectedInterval * 1.5) {
  const missedPolls = Math.floor(timeSinceLastPoll / POLLING_INTERVAL_MS) - 1;
  logger.warn("Missed oracle polls detected", { missedPolls });
  metrics.increment("oracle.missed_polls", { count: missedPolls });
}
```

#### Timeout Handling

Horizon API requests have configurable timeouts:

```typescript
const server = new Horizon.Server(HORIZON_URL, { 
  timeout: ORACLE_HORIZON_TIMEOUT_MS 
});
```

#### Health Monitoring

The oracle maintains health status:

```typescript
interface HorizonHealthCheck {
  isHealthy: boolean;
  latencyMs: number;
  lastSuccessfulPoll: Date | null;
  consecutiveFailures: number;
}
```

Critical alerts are triggered after `MAX_MISSED_POLLS` consecutive failures:

```typescript
if (consecutiveFailures >= MAX_MISSED_POLLS) {
  logger.error("CRITICAL: Oracle health check failed");
  metrics.increment("oracle.critical_failure");
}
```

### 5. Comprehensive Logging

All oracle operations are logged with structured context:

```typescript
logger.info("Oracle tick completed", {
  duration,
  paymentsProcessed: payments.length,
});

logger.error("Payment verification failed", {
  paymentId: payment.id,
  address,
  error: error.message,
});
```

### 6. Metrics Collection

The oracle collects detailed performance metrics:

```typescript
interface OracleMetrics {
  pollsCompleted: number;
  pollsFailed: number;
  paymentsVerified: number;
  paymentsPartial: number;
  paymentsOverpaid: number;
  paymentsFailed: number;
  missedPolls: number;
  lastPollTimestamp: Date;
  averagePollDurationMs: number;
}
```

Metrics are exposed via:
- Internal metrics collector
- Admin API endpoints
- Prometheus-compatible format (via existing metrics middleware)

## API Endpoints

### Admin Endpoints

All endpoints require admin authentication:

#### Get Oracle Metrics

```http
GET /api/v1/admin/oracle/metrics
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "success": true,
  "data": {
    "pollsCompleted": 1234,
    "pollsFailed": 5,
    "paymentsVerified": 456,
    "paymentsPartial": 12,
    "paymentsOverpaid": 3,
    "paymentsFailed": 2,
    "missedPolls": 1,
    "lastPollTimestamp": "2026-04-24T10:30:00.000Z",
    "averagePollDurationMs": 1250
  }
}
```

#### Get Oracle Health

```http
GET /api/v1/admin/oracle/health
Authorization: Bearer <admin_token>
```

Response (healthy):
```json
{
  "success": true,
  "data": {
    "isHealthy": true,
    "latencyMs": 1200,
    "lastSuccessfulPoll": "2026-04-24T10:30:00.000Z",
    "consecutiveFailures": 0
  }
}
```

Response (unhealthy - 503 status):
```json
{
  "success": false,
  "data": {
    "isHealthy": false,
    "latencyMs": 5000,
    "lastSuccessfulPoll": "2026-04-24T10:25:00.000Z",
    "consecutiveFailures": 6
  }
}
```

#### Manual Payment Verification

```http
POST /api/v1/admin/oracle/verify/:paymentId
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "success": true,
  "data": {
    "paymentId": "clx123abc",
    "address": "GABC...XYZ",
    "expectedAmount": "100.00",
    "actualAmount": "100.00",
    "assetCode": "USDC",
    "assetIssuer": "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
    "transactionHash": "abc123...",
    "payer": "GDEF...123",
    "verified": true,
    "status": "confirmed"
  }
}
```

## Integration

### Startup Integration

The oracle service is automatically started on application startup:

```typescript
// src/index.ts
import { startPaymentOracle, stopPaymentOracle } from "./services/paymentOracle.service";

server = app.listen(config.PORT, () => {
  // ... other startup tasks
  startPaymentOracle();
});
```

### Graceful Shutdown

The oracle is properly stopped during graceful shutdown:

```typescript
const gracefulShutdown = async (signal: string) => {
  stopCronJobs();
  stopPaymentMonitor();
  stopPaymentOracle(); // Stop oracle service
  // ... rest of shutdown
};
```

## Monitoring & Observability

### Structured Logging

All logs follow the structured logging format:

```json
{
  "level": "info",
  "message": "Oracle tick completed",
  "timestamp": "2026-04-24T10:30:00.000Z",
  "service": "fluxapay-backend",
  "context": {
    "duration": 1250,
    "paymentsProcessed": 15
  }
}
```

### Metrics

Key metrics tracked:

- `oracle.tick.duration` - Histogram of poll durations
- `oracle.active_payments` - Gauge of active payments being monitored
- `oracle.payment.verified` - Counter of verified payments (tagged by status)
- `oracle.payment.error` - Counter of verification errors
- `oracle.missed_polls` - Counter of missed polling intervals
- `oracle.tick.error` - Counter of failed polling ticks
- `oracle.critical_failure` - Counter of critical health failures

### Alerting

Recommended alerts:

1. **High Failure Rate**: `oracle.tick.error` > 5 in 5 minutes
2. **Critical Health**: `oracle.critical_failure` > 0
3. **High Latency**: `oracle.tick.duration` p95 > 5000ms
4. **Missed Polls**: `oracle.missed_polls` > 10 in 10 minutes

## Testing

### Unit Tests

```bash
npm test -- paymentOracle.service.test.ts
```

### Manual Testing

1. Start the service:
```bash
npm run dev
```

2. Create a test payment:
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "100.00",
    "currency": "USDC",
    "description": "Test payment"
  }'
```

3. Send USDC to the payment address

4. Monitor oracle logs:
```bash
tail -f server.log | grep PaymentOracleService
```

5. Check metrics:
```bash
curl http://localhost:3000/api/v1/admin/oracle/metrics \
  -H "Authorization: Bearer <admin_token>"
```

## Performance Considerations

### Batch Processing

The oracle processes payments in batches to prevent memory issues:

```typescript
const payments = await prisma.payment.findMany({
  where: { /* active payments */ },
  take: BATCH_SIZE, // Default: 50
  orderBy: { created_at: "asc" },
});
```

### Concurrent Verification

Payments are verified concurrently using `Promise.allSettled`:

```typescript
const results = await Promise.allSettled(
  payments.map(payment => verifyPayment(payment))
);
```

### Paging Token Optimization

Paging tokens prevent re-processing of old transactions:

```typescript
if (payment.last_paging_token) {
  paymentsQuery = paymentsQuery.cursor(payment.last_paging_token);
}
```

## Security Considerations

1. **Admin-Only Access**: All oracle endpoints require admin authentication
2. **Rate Limiting**: Oracle endpoints are protected by rate limiting middleware
3. **Input Validation**: Payment IDs are validated before processing
4. **Error Sanitization**: Error messages don't expose sensitive data
5. **Audit Logging**: All manual verifications are logged with admin ID

## Future Enhancements

1. **Streaming Support**: Migrate from polling to SSE streaming (see `HORIZON_STREAMING_IMPLEMENTATION.md`)
2. **Multi-Asset Support**: Extend beyond USDC to support other Stellar assets
3. **Webhook Retry Logic**: Implement exponential backoff for failed webhooks
4. **Dashboard Integration**: Add oracle metrics to merchant dashboard
5. **Predictive Alerting**: ML-based anomaly detection for payment patterns

## Related Documentation

- [Horizon Streaming Implementation](./HORIZON_STREAMING_IMPLEMENTATION.md)
- [Payment Status Lifecycle](./PAYMENT_STATUS_LIFECYCLE.md)
- [Webhook Signature Verification](./WEBHOOK_SIGNATURE_VERIFICATION.md)
- [Observability Implementation](../OBSERVABILITY_IMPLEMENTATION.md)

## Acceptance Criteria

✅ **Polling service checking Horizon API every X seconds**
- Configurable polling interval (default: 30 seconds)
- Batch processing of active payments
- Missed poll detection and alerting

✅ **Verification of amount and asset code for detected payments**
- Amount comparison (exact, partial, overpaid)
- Asset code verification (USDC)
- Issuer verification
- Payer address tracking

✅ **Smart contract call (verify_payment) on successful detection**
- Soroban integration via `paymentContractService`
- Configurable enable/disable flag
- Error handling for contract failures

✅ **Error logging and alerting for missed blocks/timeouts**
- Structured logging with context
- Health monitoring with consecutive failure tracking
- Critical alerts after threshold
- Comprehensive metrics collection
- Timeout handling for Horizon requests

---

**Implementation Complete** ✅
