# k6 load tests

## Prisma connection pool scenario

`k6-prisma-pool.js` sends 100 concurrent authenticated requests to a database-backed endpoint for 60 seconds. A passing run requires fewer than 2% failed requests and no connection-exhaustion responses (`500` or `503`).

```bash
BASE_URL="https://api.staging.fluxapay.com" \
API_KEY="sk_live_xxx" \
k6 run load-tests/k6-prisma-pool.js
```

## Payment create + list scenario

`k6-payment-create-list.js` runs a baseline flow for:

1. `POST /api/v1/payments`
2. `GET /api/v1/payments?page=1&limit=<n>`

It uses API key auth and a ramp-up profile to help catch regressions in payment creation and listing.

## Safety guard (staging only)

By default, the script refuses to run unless `BASE_URL` looks like staging.

- Keep `REQUIRE_STAGING_GUARD=true` (default) for normal use.
- Set `REQUIRE_STAGING_GUARD=false` only for deliberate local/test runs.

## Baseline targets

- Sustained throughput target: **\(\ge 20\) create+list flows/sec** during steady state.
- p95 latency target for create (`POST /payments`): **\(< 1200\) ms**.
- p95 latency target for list (`GET /payments`): **\(< 800\) ms**.
- End-to-end failure rate: **\(< 2\%\)**.

These are encoded as k6 thresholds in the scenario.

## Run

```bash
BASE_URL="https://api.staging.fluxapay.com" \
API_KEY="sk_live_xxx" \
k6 run load-tests/k6-payment-create-list.js
```

Optional tuning:

```bash
BASE_URL="https://api.staging.fluxapay.com" \
API_KEY="sk_live_xxx" \
RAMP_UP="2m" \
STEADY_DURATION="8m" \
RAMP_DOWN="2m" \
RAMP_VUS=20 \
STEADY_VUS=30 \
THINK_TIME_SECONDS=1 \
k6 run load-tests/k6-payment-create-list.js
```

---

## Webhook delivery scenario

`k6-webhook-delivery.js` stress-tests the webhook re-delivery path — which
makes outbound HTTP calls to merchant endpoints — under high concurrency.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `WEBHOOK_ID` | *(empty)* | Re-deliver a specific webhook config; omit to hit the `/webhooks/test` synthetic endpoint |
| `THINK_TIME_SECONDS` | `0` | Sleep between iterations |

### Targets

- **100 VUs, 60 s** constant load.
- p99 delivery latency **< 3 000 ms**.
- Failure rate **< 2 %**.

### Run

```bash
BASE_URL="https://api.staging.fluxapay.com" \
API_KEY="sk_live_xxx" \
k6 run load-tests/k6-webhook-delivery.js
```

To re-deliver a specific webhook:

```bash
BASE_URL="https://api.staging.fluxapay.com" \
API_KEY="sk_live_xxx" \
WEBHOOK_ID="wh_abc123" \
k6 run load-tests/k6-webhook-delivery.js
```

---

## Settlement batch scenario

`k6-settlement-batch.js` simulates **50 merchants** triggering the settlement
batch concurrently, exercising FX lookups and DB writes in parallel.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MERCHANT_COUNT` | `50` | Number of concurrent VUs (one per merchant) |
| `ITERATIONS` | `3` | Batch rounds per VU |
| `THINK_TIME_SECONDS` | `1` | Sleep between rounds |

### Targets

- **50 VUs × 3 iterations** (`per-vu-iterations` executor, max 5 min).
- p95 batch latency **< 5 000 ms**.
- Failure rate **< 2 %**.

### Run

```bash
BASE_URL="https://api.staging.fluxapay.com" \
API_KEY="sk_live_xxx" \
k6 run load-tests/k6-settlement-batch.js
```

---

## CI integration

The load tests are **not** run on every PR — they are designed to run
optionally on tagged releases via the `production-deploy` workflow.

To trigger them on a release tag, add a step similar to the following to
`.github/workflows/production-deploy.yml` (or a dedicated `load-test.yml`):

```yaml
- name: Run load tests (tagged release only)
  if: startsWith(github.ref, 'refs/tags/')
  run: |
    k6 run load-tests/k6-webhook-delivery.js
    k6 run load-tests/k6-settlement-batch.js
  env:
    BASE_URL: ${{ secrets.STAGING_BASE_URL }}
    API_KEY:  ${{ secrets.STAGING_API_KEY }}
    REQUIRE_STAGING_GUARD: "false"
```
