# k6 load tests

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
