# Mainnet Go-Live Checklist & Runbook

**Author:** FluxaPay Platform Team  
**Date:** March 2026  
**Status:** DRAFT – To be completed before mainnet cutover  

---

## Overview

This document provides a comprehensive checklist for safely transitioning FluxaPay from **Stellar Testnet** to **Stellar Mainnet**. It covers environment validation, key management, network switching procedures, rollback plans, and incident response protocols.

**Critical Path:**
1. Pre-cutover validation (3–5 business days)
2. Environment variable preparation & key rotation (2 days)
3. Network switch procedure (30 min, with rollback plan ready)
4. Post-cutover validation & merchant communication (ongoing)

---

## 1. Pre-Cutover Validation

### 1.1 Network Connectivity & Contract Deployment

- [ ] **Stellar Mainnet Horizon API health**
  - Test connectivity: `curl https://horizon.stellar.org/`
  - Verify response time < 1 second
  - Test on multiple client regions (if applicable)
  
- [ ] **Soroban RPC Mainnet availability**
  - Test: `curl https://soroban.stellar.org/`
  - Verify contract submission latency

- [ ] **Smart Contract Deployment on Mainnet**
  - [ ] Merchant Registry smart contract deployed and verified
    - Record mainnet `MERCHANT_REGISTRY_CONTRACT_ID`
    - Verify contract bytecode matches audited source
  - [ ] Payment smart contract deployed and verified
    - Record mainnet `PAYMENT_CONTRACT_ID`
    - Test contract call with admin key

- [ ] **USDC Issuer Account on Mainnet**
  - [ ] Mainnet USDC issuer public key identified: `_____________________`
  - [ ] Issuer account has required trustlines set up
  - [ ] Confirm USDC circulation and liquidity on mainnet

### 1.2 Capacity & Load Testing

- [ ] **Payment creation throughput** (target: 100+ req/sec)
  - Load test: `npm run test:load` (if exists) or manual k6/locust
  - Verify settlement & sweep operations don't bottleneck

- [ ] **Database capacity review**
  - Verify PostgreSQL instance size sufficient for mainnet transaction volume
  - Confirm backups are scheduled and tested (daily at minimum)
  - Verify point-in-time recovery (PITR) is enabled

- [ ] **Fee bump & retry strategy validation**
  - Base fee: `STELLAR_BASE_FEE=100` stroops
  - Max fee: `STELLAR_MAX_FEE=2000` stroops
  - Multiplier per retry: `STELLAR_FEE_BUMP_MULTIPLIER=2`
  - Confirm sufficient account balance to cover fee bumps during surge

### 1.3 Operational Backups & Recovery

- [ ] **Database backup tested**
  - Create backup: `pg_dump` to external storage
  - Test restore on staging environment
  - Verify all merchant data, payment records, and audit logs restore cleanly

- [ ] **Disaster recovery runbook signed off**
  - Point-to-time recovery procedure documented
  - RTO target: < 30 minutes; RPO target: < 5 minutes

- [ ] **Fund sweep configuration reviewed**
  - Sweep cron interval: `SWEEP_CRON` (default `*/5 * * * *`)
  - Batch limit: `SWEEP_BATCH_LIMIT` (default 200)
  - Lock TTL: `SWEEP_LOCK_TTL_MS` confirms cron interval is respected

---

## 2. Environment Variables & Network Configuration

### 2.1 Stellar Network Switch

Update the following env vars in production (e.g., AWS Secrets Manager, GitHub Actions secrets):

| Env Var | Testnet Value | Mainnet Value | Notes |
|---------|---------------|---------------|-------|
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` | **CRITICAL** – Mismatch causes tx failures |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` | Mainnet Horizon endpoint |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | `https://soroban.stellar.org` | Soroban contract RPC endpoint |
| `SOROBAN_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` | Must match `STELLAR_NETWORK_PASSPHRASE` |

**Procedure:**
1. Stage all new values in secure config (do NOT commit to repo)
2. Have 2 team members verify each value
3. Deploy to production at agreed cutover window
4. Verify within 5 minutes (see Section 3)

### 2.2 Key Material & Account Configuration

- [ ] **FUNDER_SECRET_KEY (HD Account Funding)**
  - Generate new testnet keypair for mainnet (DO NOT reuse testnet key)
  - Procedure: `npm run key:generate` (or use Stellar lab https://stellar.expert/labs/account-creator)
  - Fund account with sufficient mainnet XLM (~100 XLM for trustline + account creation ops)
  - Store in AWS Secrets Manager with appropriate IAM restrictions
  - Verify public key matches before deployment

- [ ] **MASTER_VAULT_SECRET_KEY (HD Wallet Sweep Destination)**
  - Create new mainnet account (or identify existing vault account)
  - Set up trustline for mainnet USDC issuer
  - Fund with small XLM amount for sweep fees (~10 XLM)
  - Store in AWS KMS encrypted
  - Record mainnet vault public key: `_____________________`

- [ ] **CONTRACT ADMIN SECRET KEY (Smart Contract Admin)**
  - Identify admin keypair used during contract deployment on mainnet
  - Verify it matches deployment transaction
  - Store securely in KMS
  - Restricted access: Only DevOps + Security lead

- [ ] **USDC_ISSUER_PUBLIC_KEY (Issuer Reference)**
  - Testnet: `GBBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y`
  - Mainnet: `_____________________` (verify with Stellar.Expert)
  - Hard-code in backend config, NOT env var (issuer shouldn't change mid-session)

### 2.3 KMS & Secret Rotation

- [ ] **AWS KMS Setup (Production)**
  - Confirm `KMS_PROVIDER=aws` in production config
  - Verify `AWS_KMS_KEY_ID` points to production master key
  - Test key rotation: `aws kms rotate-key-in-place --key-id <key-id>`
  - Verify IAM policy grants backend pod appropriate permissions

- [ ] **Master Seed Rotation (Initial Setup)**
  - Generate new master seed on mainnet (never reuse testnet seed)
  - Procedure:
    ```bash
    # On secure bastion host (not in CI)
    npm run rotation:dry-run      # Preview merchant address changes
    npm run rotation:migrate -- --confirm  # Apply & encrypt in KMS
    npm run rotation:verify       # Confirm success
    ```
  - Notify finance team of new merchant addresses for sweep validation

- [ ] **Access Control Review**
  - [ ] AWS IAM roles: Only backend service + designated ops staff can decrypt KMS keys
  - [ ] SSH access: Disable all except bastion host for seed rotation (if needed)
  - [ ] Secrets manager access: Audit logs enabled for all reads

---

## 3. Network Switch Procedure (Cutover Window)

### 3.1 Pre-Switch Validation (T-1 hour)

- [ ] **All systems running in testnet**
  - Smoke tests pass: `npm run test:smoke`
  - Recent payment & settlement batch processed successfully
  - Sweep operation completed without errors (check audit logs)

- [ ] **Database backup created**
  - Export schema: `pg_dump --schema-only > schema_backup.sql`
  - Export data: `pg_dump > data_backup.sql`
  - Verify backup file on secure storage (S3 with versioning)

- [ ] **Rollback plan staged**
  - All testnet env vars documented in secure location
  - Restore scripts ready
  - On-call rotation reviewed (L1/L2 escalation contacts confirmed)

### 3.2 Switch Execution (Cutover Window – 30 min)

**Timeline:**

| Time | Action | Owner | Rollback? |
|------|--------|-------|-----------|
| T+0 min | Announce cutover start in #ops Slack channel | DevOps Lead | No |
| T+5 min | Deploy mainnet env vars to production (no app restart initially) | DevOps | Yes |
| T+10 min | Restart backend service pods (app picks up new env vars) | DevOps | Yes |
| T+12 min | Run validation smoke tests against production | QA | Limited |
| T+15 min | Create test payment (manual API call with test API key) | Ops | Limited |
| T+20 min | Initiate test settlement batch | Finance Ops | Limited |
| T+25 min | Verify sweep operation on mainnet (check Stellar Expert) | DevOps | Limited |
| T+28 min | Announce success to merchants (email template pre-written) | Customer Ops | No |
| T+30 min | Begin monitoring phase (ongoing for 48 hours) | All teams | No |

**Critical Validation Checks (T+12 min):**

```bash
# 1. Health check
curl -X GET https://api.fluxapay.prod/api/v1/health

# 2. Create test invoice endpoint accessible
curl -X POST https://api.fluxapay.prod/api/v1/invoices \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk_live_test" \
  -d '{"amount": 10, "currency": "USDC", "customer_email": "ops@test.com"}'

# 3. Verify mainnet connectivity in logs
grep "horizon.stellar.org" /var/log/fluxapay/app.log

# 4. Check Horizon sync lag
curl https://horizon.stellar.org/ | jq '.core_latest_ledger'
```

### 3.3 Rollback (If Needed)

**Trigger condition:** If validation fails at T+15 min, execute rollback.

```bash
# 1. Revert env vars to testnet in secrets manager
aws secretsmanager update-secret \
  --secret-id fluxapay/mainnet/env \
  --secret-string file://testnet-env.json

# 2. Restart pods (app reads old testnet env vars)
kubectl rollout restart deployment/fluxapay-backend -n production

# 3. Restore database from backup (if data corruption suspected)
pg_restore -d fluxapay < data_backup.sql

# 4. Announce rollback and reschedule cutover
# Timeline: +24 hours minimum (for post-mortem & fixes)
```

---

## 4. Post-Cutover Validation (T+30 min through T+48 hours)

### 4.1 Immediate (First 30 seconds after switch)

- [ ] **API availability**
  - All endpoints return 200/400 responses, not 5xx
  - Typical response time < 500ms

- [ ] **Mainnet transaction confirmation**
  - Verify test payment is on mainnet Horizon: `https://stellar.expert/explorer/public`
  - Check transaction signatures are valid mainnet signatures

- [ ] **Audit log entries**
  - Confirm actions logged: `SELECT * FROM audit_log WHERE action='network_switch' ORDER BY created_at DESC LIMIT 1;`

### 4.2 Short-term (1–2 hours post-switch)

- [ ] **Settlement processing**
  - Manually trigger settlement batch: `POST /api/v1/admin/settlement/batch`
  - Verify settlement records created in DB with mainnet context

- [ ] **Sweep operation**
  - Trigger sweep: `POST /api/v1/admin/sweep/run` with `dry_run: true` first
  - If dry-run succeeds, run live sweep: `POST /api/v1/admin/sweep/run`
  - Monitor for errors in Stellar network (fee too low, account not found, etc.)

- [ ] **Merchant communication**
  - Send announcement email: "FluxaPay is now live on Stellar Mainnet"
  - Provide merchants with mainnet USDC balance (if applicable)
  - Include link to new mainnet transaction explorer

### 4.3 Extended (4–48 hours post-switch)

- [ ] **Payment volume monitoring**
  - Track payment success rate (target: > 99%)
  - Monitor transaction fees: Compare actual fees vs. budgeted

- [ ] **Sweep operation monitoring**
  - Verify sweep cron runs at expected intervals
  - Confirm funds arrive in vault account within 1–5 minutes
  - Check for any failed or stuck payments (see [OPS_SWEEP_MID_BATCH_FAILURE.md](OPS_SWEEP_MID_BATCH_FAILURE.md))

- [ ] **Error rate monitoring**
  - API error rate should remain < 0.1%
  - Database connection pool should not exhaust
  - No spike in rate-limit rejections

- [ ] **Team debriefing**
  - Post-cutover review meeting (within 24 hours)
  - Document any issues encountered + resolution steps
  - Update this runbook with learnings

---

## 5. Rollback Plan & Contingency

### 5.1 When to Trigger Rollback

- [ ] Payment creation failing (> 10% error rate)
- [ ] Sweep operations timing out or failing completely
- [ ] Contract calls returning unexpected errors (not "insufficient funds")
- [ ] Audit log shows data inconsistency (payment confirmed but not swept)
- [ ] Database corrupted (PITR may be needed)

### 5.2 Rollback & Recovery Steps

**Phase 1: Stop Bleeding (2 minutes)**
```bash
# Revert to testnet network passphrase
aws secretsmanager update-secret --secret-id fluxapay/network/config \
  --secret-string '{"STELLAR_NETWORK_PASSPHRASE":"Test SDF Network ; September 2015",...}'

# Restart backend
kubectl set env deployment/fluxapay-backend STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015" -n production
kubectl rollout restart deployment/fluxapay-backend -n production
```

**Phase 2: Announce & Assess (5 minutes)**
- Announce "Mainnet Cutover Rolled Back" in #ops
- Stop all merchant-facing communications
- Assess root cause (check logs, alerts, Slack threads)

**Phase 3: Data Recovery (5–10 minutes)**
- If payment records corrupted, restore from backup:
  ```bash
  pg_restore --clean -d fluxapay < data_backup.sql
  ```
- Verify restored data is consistent (compare payment IDs to Stellar network)

**Phase 4: Replan (24+ hours)**
- Root cause analysis meeting
- Update environment config / code (if bug found)
- Reschedule cutover with fixes

### 5.3 Merchant Impact & Communication

**If rollback occurs:**
- Email: "We're performing additional testing before mainnet launch. Transactions during [time window] may have duplicate entries; support will consolidate."
- Timeline: Each merchant refunded within 24 hours
- Finance team manually reconciles vault balance with blockchain

---

## 6. Incident Response & Escalation

### 6.1 Critical Incidents (During/After Cutover)

**Severity 1: Payment completely down or vault funds lost**

| Step | Owner | Time |
|------|-------|------|
| 1. Page on-call eng lead | Ops | Immediate |
| 2. Initiate rollback (see 5.2) | DevOps | ~5 min |
| 3. Page principal engineer & finance lead | Ops | ~5 min |
| 4. Assess fund loss (query Stellar) | Principal Eng | ~10 min |
| 5. Insurance/legal notification (if applicable) | Finance Lead | ~15 min |
| 6. Customer comms drafted (CEO reviews) | Customer Ops | ~20 min |

**Severity 2: Elevated error rate (1–5%) or slow sweep**

| Step | Owner | Time |
|------|-------|------|
| 1. Page on-call backend eng | Ops | Immediate |
| 2. Check Stellar network status | Eng | ~2 min |
| 3. Adjust fee bumps if needed (increase `STELLAR_BASE_FEE` if network congested) | DevOps | ~5 min |
| 4. Monitor for 30 min | Eng | Ongoing |
| 5. If not resolved in 30 min, escalate to Sev 1 | Ops Lead | T+30 |

### 6.2 Monitoring Dashboards & Alerts

Set up monitoring (e.g., Datadog, New Relic, CloudWatch):

- [ ] **Payment success rate** (alert if < 99%)
- [ ] **Swap operation duration** (alert if > 5 min mean)
- [ ] **Settlement batch processing time** (alert if > 2 min)
- [ ] **Stellar network fee spike** (alert if base fee > 500 stroops)
- [ ] **Database replication lag** (alert if > 100 ms)

---

## 7. Merchant Onboarding & Communication

### 7.1 Pre-Cutover Announcement (1 week before)

**Email Template:**

```
Subject: FluxaPay is transitioning to Stellar Mainnet

Hi [Merchant],

We're excited to announce that FluxaPay is moving to Stellar's production mainnet. 
All transactions will now be on the public Stellar blockchain starting on [DATE].

What this means for you:
- Your invoices & payments are now real, verifiable assets on mainnet
- Settlement to your vault account will continue every [PERIOD]
- No action required on your end

Timeline:
- [DATE] 2300 UTC: Cutover begins
- [DATE] 0030 UTC: Cutover complete, all systems operational on mainnet

If you have any questions, reach out to support@fluxapay.com.

Best regards,
FluxaPay Team
```

### 7.2 Post-Cutover Announcement (1 hour after success)

**Email Template:**

```
Subject: ✅ FluxaPay is Now Live on Stellar Mainnet

Hi [Merchant],

Great news! FluxaPay is now fully operational on Stellar's mainnet. 
All your payments & settlements are using real USDC assets.

New Resources:
- Mainnet dashboard: https://dashboard.fluxapay.com
- Transaction explorer: https://stellar.expert/explorer/public
- Updated API docs: https://docs.fluxapay.com/mainnet

Settlement Confirmation:
Your next settlement is scheduled for [DATE]. USDC will arrive at [vault_address].

Questions? Contact support@fluxapay.com or visit our documentation portal.

Best regards,
FluxaPay Team
```

---

## 8. Compliance & Sign-Off

### 8.1 Pre-Cutover Approvals

- [ ] **Security review sign-off** 
  - [ ] Code audit: All key management secrets are in KMS (not hardcoded)
  - [ ] Access control: IAM policies restrict env var access
  - [ ] Signed by: Security Lead, Date: ______

- [ ] **Finance & compliance review**
  - [ ] Audit logs capture all critical actions (sweep, settlement, key rotation)
  - [ ] USDC issuer on mainnet is verified and legitimate
  - [ ] Regulatory reporting readiness (if applicable)
  - [ ] Signed by: Finance Lead, Date: ______

- [ ] **Operations sign-off**
  - [ ] All runbooks tested (cutover, rollback, incident response)
  - [ ] On-call rotation confirmed
  - [ ] Monitoring dashboards live
  - [ ] Signed by: DevOps Lead, Date: ______

- [ ] **Executive approval**
  - [ ] Business stakeholders aware of cutover window
  - [ ] Customer communication templates approved
  - [ ] Signed by: CTO/CEO, Date: ______

### 8.2 Post-Cutover Attestation

Within 24 hours after successful cutover:

- [ ] **Financial reconciliation**
  - Total merchant balances match database records
  - Vault account USDC balance verified on-chain
  - Document: [MAINNET_CUTOVER_RECONCILIATION.md](MAINNET_CUTOVER_RECONCILIATION.md)

- [ ] **Audit trail completeness**
  - All critical actions (env switch, seed rotation, first sweep) logged in audit_log table
  - No data gaps or missing records

- [ ] **Post-mortem documentation**
  - Issues encountered during cutover: _______________
  - Resolution: _______________
  - Process improvements for next cutover: _______________

---

## 9. Reference Docs & Scripts

### Key Commands

```bash
# Environment Validation
curl -s https://horizon.stellar.org/ | jq '.core_latest_ledger'

# Master Seed Rotation (on bastion host)
cd fluxapay_backend
npm run rotation:dry-run
npm run rotation:migrate -- --confirm
npm run rotation:verify

# Manual Sweep Test
curl -X POST https://api.fluxapay.prod/api/v1/admin/sweep/run \
  -H "x-api-key: sk_admin_key" \
  -d '{"dry_run": true}'

# Audit Log Query
psql -U admin -h db.prod -d fluxapay -c \
  "SELECT * FROM audit_log WHERE action IN ('sweep_trigger', 'settlement_initiate') ORDER BY created_at DESC LIMIT 20;"
```

### Related Documentation

- [HD_WALLET.md](HD_WALLET.md) – HD wallet derivation algorithm
- [STELLAR_FEE_BUMP_STRATEGY.md](STELLAR_FEE_BUMP_STRATEGY.md) – Fee retry logic
- [OPS_SWEEP_MID_BATCH_FAILURE.md](OPS_SWEEP_MID_BATCH_FAILURE.md) – Sweep error recovery
- [AUDIT_LOGGING_IMPLEMENTATION.md](../AUDIT_LOGGING_IMPLEMENTATION.md) – Audit trail details
- [REVERSE_PROXY_SECURITY_HEADERS.md](REVERSE_PROXY_SECURITY_HEADERS.md) – Production security config

---

## Appendix A: Quick Reference – All Env Var Changes

| Variable | Testnet | Mainnet | Changed? |
|----------|---------|---------|----------|
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` | ✅ |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` | ✅ |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | `https://soroban.stellar.org` | ✅ |
| `SOROBAN_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` | ✅ |
| `USDC_ISSUER_PUBLIC_KEY` | `GBBD...` | `[mainnet issuer]` | ✅ |
| `FUNDER_SECRET_KEY` | `[testnet key]` | `[mainnet key]` | ✅ |
| `MASTER_VAULT_SECRET_KEY` | `[testnet key]` | `[mainnet key]` | ✅ |
| `MERCHANT_REGISTRY_CONTRACT_ID` | `[testnet ID]` | `[mainnet ID]` | ✅ |
| `PAYMENT_CONTRACT_ID` | `[testnet ID]` | `[mainnet ID]` | ✅ |

---

**Document Version:** 1.0  
**Last Updated:** March 29, 2026  
**Next Review:** Upon mainnet cutover completion
