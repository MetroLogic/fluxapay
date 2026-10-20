# Checkout Load Tests

k6 load/stress tests for the payment checkout endpoint. The `checkout-spike.js`
scenario simulates realistic customer checkout sessions:

1. Fetch payment details
2. Create a deposit address
3. Poll payment status

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6
# Linux (Debian/Ubuntu)
sudo apt-get install k6
```

## Running locally

Start the backend, then run:

```bash
npm run test:load
```

Or invoke k6 directly with custom settings:

```bash
BASE_URL=http://localhost:3000 VUS=100 DURATION=2m k6 run load-tests/checkout-spike.js
```

## Running against staging

```bash
BASE_URL=https://staging.example.com VUS=200 DURATION=5m npm run test:load
```

## Configuration

| Env var      | Default                 | Description                          |
| ------------ | ----------------------- | ------------------------------------ |
| `BASE_URL`   | `http://localhost:3000` | Target API base URL                  |
| `VUS`        | `50`                    | Peak concurrent virtual users        |
| `DURATION`   | `1m`                    | Duration at peak VUs                 |
| `PAYMENT_ID` | random per VU/iteration | Fixed payment id to exercise         |

## Thresholds

The test fails if any threshold is breached:

- `http_req_duration` p95 < 250ms
- `http_req_failed` rate < 1%
- `checkout_errors` rate < 1%
