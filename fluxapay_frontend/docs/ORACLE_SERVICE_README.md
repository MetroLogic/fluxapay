# Payment Oracle Service - Quick Start Guide

## What is the Oracle Service?

The Payment Oracle Service is a background worker that continuously monitors the Stellar blockchain for incoming payments. It automatically verifies payments, updates their status, and triggers webhooks when payments are confirmed.

## Quick Start

### 1. Configuration

Add these environment variables to your `.env` file:

```bash
# Required - Basic Configuration
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
USDC_ISSUER_PUBLIC_KEY=GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y

# Optional - Oracle Tuning (defaults shown)
ORACLE_POLLING_INTERVAL_MS=30000        # Poll every 30 seconds
ORACLE_BATCH_SIZE=50                    # Process 50 payments per batch
ORACLE_HORIZON_TIMEOUT_MS=10000         # 10 second timeout
ORACLE_MAX_MISSED_POLLS=5               # Alert after 5 failures

# Optional - Smart Contract Verification
ENABLE_SOROBAN_VERIFICATION=false       # Enable Soroban verification
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
PAYMENT_CONTRACT_ID=C...                # Your payment contract ID
```

### 2. Start the Service

The oracle starts automatically when you run the application:

```bash
npm run dev
```

You should see:
```
[PaymentOracleService] Starting payment oracle service
[PaymentOracleService] Payment oracle service started successfully
```

### 3. Monitor the Service

#### Check Health Status

```bash
curl http://localhost:3000/api/v1/admin/oracle/health \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### View Metrics

```bash
curl http://localhost:3000/api/v1/admin/oracle/metrics \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Manually Verify a Payment

```bash
curl -X POST http://localhost:3000/api/v1/admin/oracle/verify/PAYMENT_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## How It Works

### Payment Lifecycle

```
1. Payment Created (status: pending)
   ↓
2. Oracle Polls Horizon API (every 30s)
   ↓
3. Checks for USDC transactions to payment address
   ↓
4. Verifies amount and asset code
   ↓
5. Updates payment status:
   - confirmed: Full amount received
   - overpaid: More than expected
   - partially_paid: Partial payment
   - failed: Verification failed
   ↓
6. (Optional) Calls smart contract verify_payment()
   ↓
7. Triggers webhook to merchant
```

### Polling Strategy

The oracle uses an efficient polling strategy:

1. **Batch Processing**: Processes up to 50 payments per tick
2. **Cursor Tracking**: Uses paging tokens to avoid re-processing
3. **Expiry Handling**: Automatically marks expired payments
4. **Error Recovery**: Continues on individual payment failures

### Error Handling

The oracle handles various error scenarios:

- **Horizon Timeouts**: Configurable timeout with retry
- **Network Errors**: Logged and tracked in metrics
- **Missed Polls**: Detected and alerted
- **Health Degradation**: Automatic health status updates

## Monitoring & Alerting

### Key Metrics

Monitor these metrics in your observability platform:

| Metric | Type | Description |
|--------|------|-------------|
| `oracle.tick.duration` | Histogram | Time to complete one polling cycle |
| `oracle.active_payments` | Gauge | Number of payments being monitored |
| `oracle.payment.verified` | Counter | Successfully verified payments |
| `oracle.payment.error` | Counter | Failed verifications |
| `oracle.missed_polls` | Counter | Detected missed polling intervals |
| `oracle.critical_failure` | Counter | Critical health failures |

### Recommended Alerts

Set up these alerts in your monitoring system:

```yaml
# High Error Rate
- alert: OracleHighErrorRate
  expr: rate(oracle_tick_error[5m]) > 0.1
  severity: warning
  
# Critical Health Failure
- alert: OracleCriticalFailure
  expr: oracle_critical_failure > 0
  severity: critical
  
# High Latency
- alert: OracleHighLatency
  expr: histogram_quantile(0.95, oracle_tick_duration) > 5000
  severity: warning
  
# Missed Polls
- alert: OracleMissedPolls
  expr: increase(oracle_missed_polls[10m]) > 10
  severity: warning
```

### Log Monitoring

Watch for these log patterns:

```bash
# Normal operation
grep "Oracle tick completed" server.log

# Errors
grep "Oracle tick failed" server.log

# Critical issues
grep "CRITICAL: Oracle health check failed" server.log

# Payment verifications
grep "Payment status updated" server.log
```

## Performance Tuning

### Polling Interval

Adjust based on your needs:

```bash
# High-frequency (every 10 seconds)
ORACLE_POLLING_INTERVAL_MS=10000

# Standard (every 30 seconds) - Default
ORACLE_POLLING_INTERVAL_MS=30000

# Low-frequency (every 2 minutes)
ORACLE_POLLING_INTERVAL_MS=120000
```

**Trade-offs**:
- Lower interval = Faster payment detection, higher API usage
- Higher interval = Lower API usage, slower detection

### Batch Size

Adjust based on payment volume:

```bash
# Small batches (low volume)
ORACLE_BATCH_SIZE=25

# Standard batches - Default
ORACLE_BATCH_SIZE=50

# Large batches (high volume)
ORACLE_BATCH_SIZE=100
```

**Trade-offs**:
- Smaller batches = More frequent processing, lower memory
- Larger batches = Fewer DB queries, higher memory

### Horizon Timeout

Adjust based on network conditions:

```bash
# Fast timeout (good network)
ORACLE_HORIZON_TIMEOUT_MS=5000

# Standard timeout - Default
ORACLE_HORIZON_TIMEOUT_MS=10000

# Slow timeout (poor network)
ORACLE_HORIZON_TIMEOUT_MS=20000
```

## Troubleshooting

### Oracle Not Starting

**Symptom**: No oracle logs on startup

**Solutions**:
1. Check environment variables are set
2. Verify Horizon URL is accessible
3. Check for startup errors in logs

### High Failure Rate

**Symptom**: Many `oracle.tick.error` metrics

**Solutions**:
1. Check Horizon API status
2. Increase `ORACLE_HORIZON_TIMEOUT_MS`
3. Verify network connectivity
4. Check rate limiting

### Missed Polls

**Symptom**: `oracle.missed_polls` increasing

**Solutions**:
1. Check server CPU/memory usage
2. Reduce `ORACLE_BATCH_SIZE`
3. Increase `ORACLE_POLLING_INTERVAL_MS`
4. Scale horizontally (add more instances)

### Payments Not Confirming

**Symptom**: Payments stuck in `pending` status

**Solutions**:
1. Manually verify payment: `POST /admin/oracle/verify/:paymentId`
2. Check payment address has USDC trustline
3. Verify USDC was sent to correct address
4. Check transaction on Stellar Expert
5. Review oracle logs for errors

### Smart Contract Verification Failing

**Symptom**: Payments marked as `failed` after verification

**Solutions**:
1. Check `SOROBAN_RPC_URL` is accessible
2. Verify `PAYMENT_CONTRACT_ID` is correct
3. Check contract is deployed and initialized
4. Review contract logs
5. Temporarily disable: `ENABLE_SOROBAN_VERIFICATION=false`

## Development

### Running Tests

```bash
# Run oracle service tests
npm test -- paymentOracle.service.test.ts

# Run with coverage
npm test -- --coverage paymentOracle.service.test.ts
```

### Local Development

```bash
# Start with debug logging
LOG_LEVEL=debug npm run dev

# Start without oracle (for testing)
DISABLE_CRON=true npm run dev
# Then manually start oracle via API
```

### Testing Payment Flow

1. Create a test payment:
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10.00",
    "currency": "USDC",
    "description": "Test payment"
  }'
```

2. Note the `stellar_address` from response

3. Send USDC to that address using Stellar Laboratory or wallet

4. Watch oracle logs:
```bash
tail -f server.log | grep PaymentOracleService
```

5. Verify payment status updated:
```bash
curl http://localhost:3000/api/v1/payments/PAYMENT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Production Deployment

### Pre-Deployment Checklist

- [ ] Set production Horizon URL
- [ ] Configure appropriate polling interval
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Test smart contract integration (if enabled)
- [ ] Set up health check endpoint monitoring
- [ ] Configure auto-scaling based on metrics
- [ ] Document runbook for common issues

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fluxapay-backend
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: backend
        env:
        - name: ORACLE_POLLING_INTERVAL_MS
          value: "30000"
        - name: ORACLE_BATCH_SIZE
          value: "50"
        - name: ORACLE_MAX_MISSED_POLLS
          value: "5"
        livenessProbe:
          httpGet:
            path: /api/v1/admin/oracle/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 60
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
```

### Scaling Considerations

The oracle service is designed to run on multiple instances:

- **Concurrent Processing**: Multiple instances can process different payment batches
- **Database Locking**: Uses optimistic locking to prevent race conditions
- **Idempotent Operations**: Safe to process same payment multiple times
- **Paging Tokens**: Each instance tracks its own cursor position

**Recommended Setup**:
- 2-3 instances for redundancy
- Load balancer for API endpoints
- Shared database for state
- Centralized logging and metrics

## FAQ

**Q: Can I run multiple oracle instances?**  
A: Yes, the oracle is designed to be horizontally scalable. Multiple instances will process different batches of payments.

**Q: What happens if the oracle misses a payment?**  
A: The oracle uses paging tokens to track processed transactions. If a poll is missed, the next poll will catch up. Payments also have expiry times as a safety net.

**Q: How do I disable the oracle temporarily?**  
A: Set `DISABLE_CRON=true` in your environment. This disables all background jobs including the oracle.

**Q: Can I change the polling interval without restarting?**  
A: No, you need to restart the service for configuration changes to take effect.

**Q: Does the oracle support multiple assets?**  
A: Currently only USDC is supported. Multi-asset support is planned for a future release.

**Q: What's the difference between the oracle and payment monitor?**  
A: The oracle is the enhanced version with smart contract integration, better error handling, and comprehensive metrics. The payment monitor is the legacy polling service.

## Support

For issues or questions:

1. Check the [Implementation Documentation](./ORACLE_SERVICE_IMPLEMENTATION.md)
2. Review [Horizon Streaming](./HORIZON_STREAMING_IMPLEMENTATION.md) for future enhancements
3. Check [Payment Status Lifecycle](./PAYMENT_STATUS_LIFECYCLE.md) for status flow
4. Open an issue on GitHub
5. Contact the development team

---

**Last Updated**: April 24, 2026  
**Version**: 1.0.0
