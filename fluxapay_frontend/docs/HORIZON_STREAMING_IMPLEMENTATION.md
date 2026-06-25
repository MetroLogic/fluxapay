# Horizon Streaming PoC - Implementation Guide

**Status**: Simplified working reference implementation  
**Latest Updated**: March 30, 2026

---

## Quick Start: Using the Streaming Monitor

### Installation

```typescript
// In app.ts or index.ts
import { Horizon } from "@stellar/stellar-sdk";
import { streamManager } from "./services/paymentMonitor.streaming.minimal";

const app = express();
const horizonServer = new Horizon.Server(
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org"
);

// On startup
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  if (process.env.PAYMENT_MONITOR_STREAMING_ENABLED === "true") {
    // Fetch active payments from DB
    const payments = await prisma.payment.findMany({
      where: {
        status: { in: ["pending", "partially_paid"] },
        expiration: { gt: new Date() },
        stellar_address: { not: null },
      },
    });
    
    streamManager.start(payments, horizonServer);
    console.log("✅ Payment stream monitoring started");
  }
});

// On graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  streamManager.stop();
  process.exit(0);
});
```

---

## Configuration

### Environment Variables

```bash
# Enable/disable streaming (default: false = polling mode)
PAYMENT_MONITOR_STREAMING_ENABLED=true

# Heartbeat timeout (detect stale streams)
PAYMENT_MONITOR_HEARTBEAT_TIMEOUT_MS=30000

# Max reconnection attempts before giving up
PAYMENT_MONITOR_MAX_RECONNECT_ATTEMPTS=5

# Exponential backoff parameters
PAYMENT_MONITOR_INITIAL_BACKOFF_MS=1000
PAYMENT_MONITOR_MAX_BACKOFF_MS=300000
```

---

## Architecture

### Three-Tier Fallback Strategy

```
┌─ Tier 1: SSE Streaming (Primary) ──────────────────────
│  ├─ Persistent connection per payment address
│  ├─ Event latency: <100ms
│  ├─ On connection failure → Tier 2
│  └─ Reconnection: exponential backoff (1s → 5m)
│
├─ Tier 2: Fallback Polling (Secondary) ───────────────
│  ├─ Runs every 5 minutes (configurable)
│  ├─ Catches: expired payments, health checks
│  ├─ Event latency: 5 minutes (degraded)
│  ├─ If Horizon unavailable → Tier 3
│  └─ Low resource overhead
│
└─ Tier 3: Manual Verification (Emergency) ────────────
   ├─ API endpoint: POST /admin/verify-payment
   ├─ Dashboard button: "Force Check Now"
   ├─ Merchant dashboard can trigger manually
   └─ Paging tokens ensure no missed payments
```

---

## Implementation Details

### PaymentStream Class

Manages a single SSE connection for one payment address:

```typescript
class PaymentStream {
  // Constructor: receives payment ID and Stellar address
  constructor(paymentId: string, address: string)

  // Start streaming (with automatic reconnection on failure)
  async start(horizonServer): Promise<void>

  // Handle incoming payment events
  private onPaymentEvent(record): void

  // Monitor heartbeat for stale connections
  private startHeartbeatMonitor(): void

  // Reconnect with exponential backoff
  private async scheduleReconnect(horizonServer): Promise<void>

  // Close connection gracefully
  close(): void

  // Check if stream is healthy
  isHealthy(): boolean
}
```

### PaymentStreamManager Class

Manages multiple payment streams:

```typescript
class PaymentStreamManager {
  // Initialize and start all streams
  async startStreaming(): Promise<void>

  // Fallback polling (health checks every 5 min)
  private startFallbackPolling(): void

  // Graceful shutdown
  stopStreaming(): void

  // Get current status
  getStatus()
}
```

### Reconnection Logic

**Exponential Backoff**:

```
Attempt 1: Wait 1s,    retry connection
Attempt 2: Wait 2s,    retry connection
Attempt 3: Wait 4s,    retry connection
Attempt 4: Wait 8s,    retry connection
Attempt 5: Wait 16s,   retry connection
Max reached: Give up, fall back to polling

Maximum backoff: 5 minutes
```

**Triggers**:
- Network error
- TCP connection dropped
- Heartbeat timeout (30 seconds)
- Stream closed unexpectedly

---

## Integration Steps

### 1. Add to your payment monitor workflow

```typescript
// paymentMonitor.ts - decide which mode to use

export async function initPaymentMonitor() {
  const streamingEnabled = process.env.PAYMENT_MONITOR_STREAMING_ENABLED === "true";

  if (streamingEnabled) {
    // Use streaming
    const server = new Horizon.Server(HORIZON_URL);
    await initPaymentStreamMonitor(server);
  } else {
    // Use polling (existing code)
    startPaymentMonitor();
  }
}
```

### 2. Handle payment events in stream

In `PaymentStream.onPaymentEvent()`, implement:

```typescript
private onPaymentEvent(record: any): void {
  // 1. Deduplicate: check if already processed
  if (this.processedTxHashes.has(record.transaction_hash)) {
    return;
  }

  // 2. Fetch current balance
  const account = await horizonServer.loadAccount(this.address);
  const balance = account.balances.find(
    (b: any) => b.asset_code === "USDC"
  );

  // 3. Update payment status in DB
  const expectedAmount = payment.amount;
  let newStatus: string;
  if (balance >= expectedAmount) {
    newStatus = balance > expectedAmount ? "overpaid" : "confirmed";
  } else if (balance > 0) {
    newStatus = "partially_paid";
  }

  // 4. Update DB
  await prisma.payment.update({
    where: { id: this.paymentId },
    data: {
      status: newStatus,
      transaction_hash: record.transaction_hash,
      last_paging_token: record.paging_token,
    },
  });

  // 5. Trigger verification
  if (newStatus === "confirmed" || newStatus === "overpaid") {
    paymentContractService.verify_payment(
      this.paymentId,
      record.transaction_hash,
      balance.toString()
    );
    eventBus.emit("payment.confirmed", updatedPayment);
  }
}
```

### 3. Add metrics/monitoring

Replace console logging with your metrics system:

```typescript
// Instead of:
console.log(`[Stream] Connected: ${this.paymentId}`);

// Use:
metrics.increment("payment_stream_connected");
logger.info(`Stream connected for ${this.paymentId}`);
```

### 4. Add health check endpoint

```typescript
app.get("/admin/health/payment-monitor", (req, res) => {
  const status = getPaymentStreamStatus();
  res.json({
    mode: process.env.PAYMENT_MONITOR_STREAMING_ENABLED ? "streaming" : "polling",
    streams: status.totalStreams,
    healthy: status.healthyStreams,
  });
});
```

---

## Failure Scenarios & Recovery

### Scenario 1: Single Stream Connection Lost

```
Chain of Events:
1. Network error occurs
2. onerror callback fires immediately
3. scheduleReconnect() triggered
4. Exponential backoff: wait 1s
5. Retry connection
6. On failure, wait 2s, retry again
...
Result: Continue retrying until success or max attempts exceeded
Time to Recovery: Seconds to 1 minute
Detection Latency: Increases to 5+ minutes during backoff
```

### Scenario 2: Horizon Service Unavailable (503)

```
If >90% of streams fail within 1 minute:
1. All stream connections fail
2. Fallback polling activates automatically
3. Poll interval set to 30 seconds (aggressive)
4. Continue monitoring payments via polling
5. When Horizon recovers, resume streaming

Time to Detection: <1 minute
Time to Fallback: Immediate
SLA Impact: Slight latency increase, but 100% coverage maintained
```

### Scenario 3: Long Network Partition (30+ seconds)

```
1. All heartbeats timeout
2. All streams closed by heartbeat monitor
3. Reconnection backoff in effect
4. Happens naturally - no special handling needed
5. Once network recovers, connections re-establish

Max recovery time: 5 minutes (then give up and fallback to polling)
Data loss: None (paging tokens preserve position)
```

### Scenario 4: Process Restart

```
1. shutdownPaymentStreamMonitor() called
2. All streams closed gracefully
3. Process exits/restarts
4. On restart: initPaymentStreamMonitor() called
5. New streams created for all active payments
6. Fresh connections established

Data consistency: DB state is source of truth
Missed payments: Fallback polling catches any during restart
```

---

## Performance Metrics

### Current Implementation (Polling - 2 minute interval)

```
Active Payments:  100
Calls per cycle:  200 (2 per payment × 100)
Cycle interval:   2 minutes (120 seconds)
QPS equivalent:   1.67 req/sec
Detection latency: 0-120s (average 60s)
Memory:           ~1 MB (stateless)
```

### Expected with Streaming

```
Active Payments:  100
Initial calls:    100 (one per stream setup)
Ongoing QPS:      0 req/sec (event-driven push)
Detection latency: <100ms
Memory:           ~5-10 MB (persistent connections)
Bandwidth:        ~1 KB/min per stream (heartbeats only)
```

### Scalability Comparison

| Scenario | Polling | Streaming |
|----------|---------|-----------|
| 50 concurrent | ✅ (3.3 req/sec) | ✅ (minimal) |
| 100 concurrent | ⚠️ (6.7 req/sec at limit) | ✅ (optimal) |
| 200 concurrent | ❌ (13.3 req/sec over limit) | ✅ (scales well) |
| 500+ concurrent | ❌ (impossible) | ✅ (can handle) |

---

## Monitoring & Alerting

### Key Metrics to Track

```typescript
// Stream health
metrics.gauge("payment_streams_active", totalStreams);
metrics.gauge("payment_streams_healthy", healthyStreams);

// Event processing
metrics.increment("payment_stream_event_detected"); // per event
metrics.histogram("payment_detection_latency_ms", latency);

// Connection health
metrics.increment("payment_stream_reconnect_attempted");
metrics.increment("payment_stream_connection_failed");

// Fallback detection
metrics.increment("payment_stream_fallback_activated");
```

### Alert Thresholds

```
🔴 CRITICAL:
  - If healthy_streams < total_streams * 0.9 for >1 minute
  - If all streams down (fallback to polling)
  - If HTTP 429 rate limit exceeded

🟡 WARNING:
  - If reconnect attempts > 3 in rapid succession
  - If fallback polling active for >30 minutes
  - If memory per stream > 2 MB

🟢 INFO:
  - Stream connected/disconnected (expected)
  - Fallback polling started (temporary)
  - Graceful shutdown completed
```

---

## Deployment Checklist

- [ ] Code review of simplified implementation
- [ ] Unit tests for reconnection logic
- [ ] Integration tests with sandbox Horizon
- [ ] Load tests with 50-100 concurrent streams
- [ ] Metrics dashboard set up
- [ ] Alert rules configured
- [ ] Runbooks written for operators
- [ ] Rollback procedure documented
- [ ] Staged rollout plan approved
- [ ] Customer communication (if needed)

---

## Rollback Plan

If critical issues occur with streaming:

```bash
# 1. IMMEDIATELY: Disable streaming
export PAYMENT_MONITOR_STREAMING_ENABLED=false

# 2. Restart application instances
# (automatic fallback to polling mode)

# 3. Verify polling is active
curl localhost:3000/admin/health/payment-monitor
# Should show: mode: "polling"

# 4. Monitor metrics
# Verify payment_monitor_tick running every 2 min

# 5. Investigate and fix
# Create incident post-mortem
```

**Rollback Time**: <5 minutes (single env var change + restart)  
**Data Loss**: None (paging tokens preserved)  
**User Impact**: Temporary delay in payment detection (2-minute polling cycle)

---

## References

- [Minimal Working Implementation](./paymentMonitor.streaming.minimal.ts)
- [Spike Analysis](./HORIZON_STREAMING_SPIKE.md)
- [Decision Document](./HORIZON_STREAMING_DECISION.md)
- [Stellar Horizon Docs](https://developers.stellar.org/api/reference/)
- [stellar-sdk v14 GitHub](https://github.com/stellar/js-stellar-sdk)
