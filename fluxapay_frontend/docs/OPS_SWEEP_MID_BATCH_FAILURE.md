# Ops runbook: fund sweep fails or stalls mid-batch

This document covers the **USDC fund sweep** that moves balances from per-payment Stellar addresses into the **master vault** (`SweepService` / `sweepPaidPayments`). It is **not** the merchant **settlement batch** (fiat payout scheduling); see settlement batch runbooks or `settlementBatch.service.ts` for that flow.

---

## 1. Symptoms to watch for

| Symptom | Likely meaning |
|--------|----------------|
| **Unsettled / unswept counts stay high** while cron is running | Some payments in the batch errored; later ticks should retry unswept rows (see idempotency below). |
| **Audit shows `sweep_complete` but treasury movement looks incomplete** | Partial success: some addresses were swept; others were recorded in the run’s `skipped` list (per-payment errors do not fail the whole HTTP/cron response). |
| **Audit shows `sweep_fail`** | The sweep run recorded **zero** successful address sweeps **and** at least one skipped/error entry (see §2 for the exact rule in code). |
| **`[SweepCron] Lock held by another instance – skipping tick`** | Another process holds the DB sweep lease; normal if a second instance or a long run overlaps. Repeated skips for **longer than `SWEEP_LOCK_TTL_MS`** may indicate a stuck or crashed worker. |
| **Cron JSON log `level":"error"` / `message":"Sweep failed"`** | Uncaught failure **outside** the per-payment loop (e.g. audit/DB issues at completion), or failure before/during the inner sweep in an unexpected way—correlate with stack traces and `sweep_cron_error` metric lines. |
| **USDC moved on-chain but row still `swept = false`** | Rare edge case: process crash **after** Horizon accepted the tx **before** `Payment` update (see §4). |

---

## 2. Logs and data to check

### 2.1 Application stdout (backend)

- **Scheduled runs**: Lines from `[Cron]` and `[SweepCron]`, plus structured JSON such as:
  - Success: `message":"Sweep completed"` with `sweepId`, `addressesSwept`, `totalAmount`, `skipped`, `durationMs`.
  - Failure: `message":"Sweep failed"` with `error`, `durationMs`.
- **Metrics-style lines** (console): `sweep_cron_success`, `sweep_cron_error`, `sweep_cron_skipped` with `reason: lock_held`.
- **Per-payment issues**: Entries pushed to the sweep result’s `skipped` array (reason strings often include Horizon/Stellar errors). For manual runs, the API response includes `skipped`.

### 2.2 Audit trail (admin UI or DB)

Filter audit actions:

- `sweep_trigger` — run started  
- `sweep_complete` — run finished and classified as completed (includes **partial** success when at least one address was swept)  
- `sweep_fail` — run finished with **no** successful sweeps but had failures/skips  

Details on the updated row include `statistics` (e.g. `addresses_swept`, `total_amount`, `transaction_hash`) and, on failure, `failure_reason` (truncated sample of payment IDs and reasons).

**Note:** When the **cron** wrapper runs, it creates its **own** sweep audit entry in addition to the entry created **inside** `sweepPaidPayments`. Use timestamps and `trigger_reason` / `sweep_type` in `details` to match outer vs inner logs if needed.

### 2.3 Database

- **`Payment`**: `swept`, `swept_at`, `sweep_tx_hash` for confirmations; eligible rows for the next run have `swept = false`, non-null `stellar_address`, status in `confirmed` / `overpaid` / `paid`, ordered by `confirmed_at`.
- **`CronLock`** (job `sweep`): If `expires_at` is in the future and the owning process is gone, other instances skip until expiry (default TTL from `SWEEP_LOCK_TTL_MS`, e.g. 10 minutes).

### 2.4 Configuration (env)

- `SWEEP_BATCH_LIMIT` — max payments attempted **per run** (default `200`).  
- `SWEEP_CRON` — schedule (default every 5 minutes).  
- `SWEEP_LOCK_TTL_MS` — DB lease duration for the sweep job.  
- `DISABLE_SWEEP_CRON` — if `true`, only **manual** sweeps run.

### 2.5 Horizon / Stellar

For a specific payment stuck unswept, compare **on-chain USDC balance** of `stellar_address` to DB `swept`. Discrepancy after a successful submit may indicate the crash window in §4.

---

## 3. Safe re-run procedure and idempotency

### 3.1 Normal recovery (no manual action)

- Cron re-invokes sweep on the next tick. **Already swept** payments have `swept = true` and are **not** selected again.
- **Manual run:** `POST /api/v1/admin/sweep/run` (admin auth). Optional body: `{ "dry_run": true }` to simulate without submitting; `{ "limit": N }` to cap batch size for a controlled retry.

### 3.2 Idempotency (what is safe to repeat)

- **One Stellar transaction per payment address.** After success, the service sets `swept`, `swept_at`, and `sweep_tx_hash` on that `Payment`.
- **Re-run on a payment that already settled on-chain:** The job loads live USDC balance; if **zero**, the payment is **skipped** (`No USDC balance to sweep`) and **left `swept = false`** until reconciled. So funds are not double-sent from that address, but **bookkeeping may be wrong** until ops/engineering fix the row (§5).
- **Concurrent runs:** Only one cron execution should hold the sweep lock at a time; another instance gets “lock held — skipping.” Manual + cron overlap is similarly serialized by the lock **only if** both use `runSweepWithLock`—the **HTTP admin route calls `sweepPaidPayments` directly** without the DB lock, so **avoid** firing manual sweeps during heavy cron overlap unless you accept parallel sweep attempts (Stellar sequence/race risk on the same keys).

### 3.3 Before escalating

1. Confirm `DISABLE_SWEEP_CRON` is not accidentally set.  
2. Check recent `sweep_complete` / `sweep_fail` audits and cron JSON logs for the same window.  
3. For stuck lock: wait for `SWEEP_LOCK_TTL_MS` or verify the holding instance is healthy.  
4. Optional: one **dry run** to see how many addresses would still move.

---

## 4. Escalation path

| Tier | When | Action |
|------|------|--------|
| **L1 — On-call / Ops** | Elevated `skipped` counts, intermittent Horizon errors, lock skips that clear after TTL | Monitor next cron cycles; use dry run; gather audit IDs and log snippets. |
| **L2 — Engineering** | Persistent `sweep_fail`, audit/DB errors, suspected bug in derivation or vault config, or **on-chain USDC already in vault but `swept` is still false** | Engineering verifies Horizon tx vs DB, may patch `Payment` after manual proof, and reviews `MASTER_VAULT_SECRET_KEY` / Horizon / network env. |
| **L3 — Finance / Treasury** | Large value uncertain, possible duplicate movement, or extended inability to sweep | Pause manual bulk retries if parallel runs cannot be ruled out; formal reconciliation against vault and per-address history. |

**Security:** Do not paste **secret keys** or **admin** tokens into tickets; reference config sources and redacted public keys only.

---

## 5. Reference (implementation)

- Sweep loop and per-payment try/catch: `src/services/sweep.service.ts`  
- Cron lock, metrics, and outer audit: `src/services/sweepCron.service.ts`  
- Admin trigger: `src/routes/sweep.route.ts`  
- Audit helpers: `src/services/audit.service.ts` (`logSweepTrigger`, `updateSweepCompletion`)
