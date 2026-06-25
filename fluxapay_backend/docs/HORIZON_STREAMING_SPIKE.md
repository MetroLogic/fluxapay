# Horizon Streaming Spike: SSE/Cursor vs Polling

**Date**: March 30, 2026  
**Status**: SPIKE IN PROGRESS  
**Goal**: Evaluate streaming mechanisms to reduce polling load on Horizon for payment monitoring.

---

## Executive Summary

Current implementation uses **polling (every 2 minutes)** for payment detection. As payment volume scales, this creates:
- **Redundant API calls** for unchanged accounts
- **Latency** (up to 2 minutes to detect payment)
- **Rate limit risk** at scale (±1000 concurrent pending payments = ±16.67 req/sec)

This spike evaluates **Horizon Streaming** (both SSE and Cursor-based approaches) to determine optimal monitoring strategy.

---

## Current Implementation Analysis

### Polling Architecture (Status: In Production)

**File**: `paymentMonitor.service.ts`

**Mechanism**:
- Runs every 120 seconds (configurable via `PAYMENT_MONITOR_INTERVAL_MS`)
- Per tick: fetches all pending/partially_paid payments from DB
- Per payment: makes 2 REST calls:
  1. `loadAccount(address)` → fetch USDC balance
  2. `payments().forAccount(address).cursor(lastToken)` → fetch new transactions

**Current Optimization**: Uses cursor paging token to skip already-processed transactions

### Cost Analysis (Polling)

| Metric | Value | Notes |
|--------|-------|-------|
| **Interval** | 2 min (120s) | Configurable |
| **Calls per tick** | 2 × N payments | Account load + payment query |
| **QPS @ 100 active** | ~3.3 req/sec | 200 calls / 2 min |
| **QPS @ 1000 active** | ~33 req/sec | 2000 calls / 2 min |
| **Detection latency** | 0-120s | Average 60s |
| **Unused data** | ~90%+ | Most ticks see no change |

### Limitations

- **Rate limiting**: Horizon testnet: 3,600 req/hour (1 req/sec sustained)
- **Per-payment overhead**: 2 calls per payment per cycle regardless of activity
- **Scalability ceiling**: With strict rate limits, can monitor ~30-45 concurrent payments
- **Real-time feedback**: 2-minute lag on payment detection

---

## Candidate Solutions

### Option 1: Server-Sent Events (SSE) Streaming

**Horizon Support**: ✅ YES  
**API Endpoint**: `GET /accounts/{account_id}/transactions?stream=true`

#### Advantages
- **True push model**: Events arrive immediately
- **Minimal bandwidth**: Only changed accounts stream updates
- **Lower latency**: <1s (vs 2-minute polling)
- **Single persistent connection per payment** (vs repeated polls)
- **No redundant queries**: Load account only on activity

#### Disadvantages
- **Persistent connections**: N connections for N active payments (resource overhead)
- **Complex reconnect logic**: Network failures, server restarts
- **Memory per connection**: ~100-500 bytes × N connections
- **Long-lived process**: More complex error handling, graceful shutdown
- **Horizon availability**: If Horizon goes down, monitoring delays immediately

#### Resource Estimate (1000 concurrent)
- **Memory**: ~1-10 MB (minimal; SDK handles cleanup)
- **Connections**: 1000 persistent TCP connections
- **CPU**: Low (mostly I/O wait)
- **Network bandwidth**: ~1 KB/sec vs ~200 KB/sec polling

#### Implementation Complexity
- **Reconnection strategy**: Exponential backoff + max retries
- **Health checks**: Periodic heartbeat validation
- **Deduplication**: Track processed transaction hashes
- **Graceful shutdown**: Drain connections cleanly

### Option 2: Enhanced Cursor Polling (Current + Optimization)

**Status**: Already partially implemented  
**API Endpoint**: `GET /accounts/{account_id}/payments?cursor={token}`

#### Advantages
- **No infrastructure change**: Uses existing cursor optimization
- **Stateless**: No persistent connections required
- **Simple**: Easy error recovery and scaling
- **Rate-limited safety**: Predictable call count
- **Dynamic interval**: Can adjust based on activity patterns

#### Disadvantages
- **Wasted cycles**: Still polls unchanged accounts
- **Higher latency**: 2-minute average detection time
- **Throughput ceiling**: Rate limits ~1 req/sec × 1-2 calls/payment = 30-45 concurrent
- **QPS scaling**: Linear growth with concurrent payments

#### Optimization Strategies
1. **Adaptive intervals**: Increase frequency for high-activity merchants
2. **Activity tracking**: Skip dead accounts between cycles
3. **Batch by merchant**: Group queries by merchant to reduce overhead
4. **Smart pre-fetching**: Prefetch balance only if recent activity

#### Resource Estimate
- **Memory**: ~1 MB (stateless)
- **Connections**: 0 persistent (stateless HTTP)
- **CPU**: Minimal
- **Network**: ~1-2 KB/req × 2 calls × N payments

### Option 3: Hybrid Approach (SSE + Polling Fallback)

**Mixed Strategy**

#### Architecture
- **Primary**: SSE streaming for active payment accounts
- **Fallback**: Polling for disconnected/stale streams
- **Tiered**: Streaming for high-volume, polling for low-volume

#### Advantages
- **Resilience**: Fallback to polling if streaming fails
- **Flexible**: Choose best strategy per payment/merchant
- **Real-time focus**: Stream where it matters most
- **Graceful degradation**: System continues if Horizon stream down

#### Disadvantages
- **Operational complexity**: Two code paths to maintain
- **Inconsistent behavior**: Some payments detected quickly, others slowly
- **Resource overhead**: Both streaming and polling resources needed
- **Harder to debug**: More state to track

---

## Recommendation Matrix

| Criteria | Polling | SSE Stream | Hybrid |
|----------|---------|-----------|---------|
| **Implementation difficulty** | ⭐ (done) | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Latency** | 60-120s | <1s | <1s / 60s |
| **Resource efficiency** | ▓▓░░░ | ▓░░░░ | ▓▓░░░ |
| **Operational simplicity** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Error recovery** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **QPS scalability** | 30-50 concurrent | 500+ concurrent | 200+ concurrent |
| **Rate limit safety** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## Decision Framework

### Choose **Polling (Optimized)** if:
- ✅ Monitoring <50 concurrent payments
- ✅ 2-minute latency acceptable
- ✅ Operational simplicity priority
- ✅ Cannot justify stream complexity
- ✅ High network unreliability (persistent connections risk)

### Choose **SSE Streaming** if:
- ✅ >100 concurrent active payments
- ✅ Sub-second payment detection critical
- ✅ Ready to own persistent connection management
- ✅ Can implement robust reconnection logic
- ✅ Operational team comfortable with long-lived processes

### Choose **Hybrid** if:
- ✅ Phased adoption needed
- ✅ Different SLAs by payment type
- ✅ Can invest in sophisticated monitor logic
- ✅ Team has bandwidth for dual maintenance

---

## Spike Deliverables

### Phase 1: Analysis (CURRENT)
- [x] Document current costs/usage patterns
- [x] Evaluate Horizon streaming capabilities
- [x] Create comparison matrix
- [ ] **Next: Run PoC benchmarks** (Phase 2)

### Phase 2: Proof-of-Concept (PENDING)
- [ ] Implement minimal SSE streaming worker
- [ ] Add reconnect logic (exponential backoff)
- [ ] Create side-by-side benchmark test
- [ ] Measure latency, memory, QPS in both modes
- [ ] Document PoC findings

### Phase 3: Decision & Fallback Strategy (PENDING)
- [ ] Based on PoC: recommend Polling vs Streaming vs Hybrid
- [ ] Document fallback behavior:
  - If SSE connects fails → revert to polling
  - If stream stale (no heartbeat) → reconnect
  - If rate-limited → back off and retry
- [ ] Outline production deployment plan

---

## Horizon API Reference (Relevant to Streaming)

### Current Cursor-Based Polling
```typescript
// Already implemented
server.payments()
  .forAccount(address)
  .cursor(lastToken)  // Resume from cursor
  .order('desc')
  .limit(10)
  .call()
```

### SSE Streaming (Candidate)
```typescript
// Pseudocode - requires SDK enhancement or raw HTTP
const stream = server.payments()
  .forAccount(address)
  .stream({
    onmessage: (payload) => { /* handle event */ },
    onerror: (error) => { /* reconnect */ }
  })
```

**Status**: Check if `stellar-sdk` v12+ supports streaming out-of-box.

### Account Balance Streaming (Alternative)
```typescript
// Could monitor account general changes instead of payment-specific
server.accounts()
  .forAccount(address)
  .stream()  // if available
```

---

## Risk Assessment

| Risk | Mitigation | Severity |
|------|-----------|----------|
| **SSE connection storms (scale)** | Implement backoff + connection pooling | HIGH |
| **Horizon API changes** | Monitor Stellar roadmap, v-manage SDK updates | MEDIUM |
| **Network unreliability** | Health checks + auto-reconnect | MEDIUM |
| **Rate limiting (polling)** | Adaptive intervals, batch optimization | MEDIUM |
| **Operational burden** | Comprehensive monitoring, clear runbooks | MEDIUM |

---

## Next Steps

1. **Phase 2 - PoC**: Implement minimal SSE worker + benchmark
2. **Gather metrics**: Compare in realistic load scenarios
3. **Team review**: Present findings and make go/no-go decision
4. **If go**: Plan Phase 3 implementation in sprint XX

---

## Appendix: Current Payment Monitor Lifecycle

```
┌─ Payment Created
│  └─ stellar_address assigned (HD Wallet derivation)
│  └─ status = 'pending'
│  └─ Payment inserted in DB
│
└─ Payment Monitor Tick (every 2 min)
   ├─ Load all pending/partially_paid payments
   ├─ For each payment:
   │  ├─ GET /accounts/{address}  [loadAccount]
   │  │  └─ Extract USDC balance
   │  ├─ GET /payments?for_account={address}&cursor={token}  [payments list]
   │  │  └─ Detect new USDC transactions
   │  ├─ Update last_paging_token to DB
   │  └─ If balance >= expected:
   │     ├─ Update status → 'confirmed'/'overpaid'
   │     ├─ Trigger on-chain verification (Soroban)
   │     └─ Emit PAYMENT_CONFIRMED event
   └─ (repeat next tick)
```

---

## References

- [Stellar Horizon API Docs](https://developers.stellar.org/api/reference/)
- [stellar-sdk GitHub](https://github.com/stellar/js-stellar-sdk)
- [Payment Monitor Implementation](./paymentMonitor.service.ts)
- [Cursor-based Pagination Guide](https://developers.stellar.org/api/introduction/pagination/)
