# Prometheus Metrics

The backend exposes Prometheus metrics at `GET /metrics`. In production, requests must include the configured `X-Admin-Secret` header. Set `ADMIN_SECRET` in the backend environment and restrict the endpoint to trusted scraper networks as an additional deployment-level control. If `ADMIN_SECRET` is missing in production, the endpoint responds with `503`; in development, the existing admin middleware allows access without a secret.

The endpoint uses `prom-client` and includes default Node.js runtime/process metrics alongside FluxaPay business metrics.

## Payment Metrics

| Metric | Type | Labels | Description |
| --- | --- | --- | --- |
| `fluxapay_payment_stage_duration_seconds` | Histogram | `stage` | Elapsed time in a payment lifecycle stage, in seconds. |
| `fluxapay_payments_failed_total` | Counter | `error_code`, `currency` | Failed payment and settlement processing outcomes grouped by normalized error code and currency. |
| `fluxapay_payments_created_total` | Counter | None | Payments created. |
| `fluxapay_payments_confirmed_total` | Counter | None | First-time payment confirmations. |
| `fluxapay_webhook_delivery_total` | Counter | `status` | Webhook delivery outcomes. |
| `fluxapay_settlement_batch_total` | Counter | `currency` | Settlement batches initiated. |

The stage histogram currently records:

- `onchain_confirmation`: payment creation (`createdAt`) to its first confirmation (`confirmed_at`).
- `off_ramp_settlement`: first confirmation (`confirmed_at`) to successful settlement (`settled_at`).

These durations use persisted payment timestamps, so they remain meaningful across process restarts. Scrape every backend instance; Prometheus should aggregate the resulting per-instance series. Avoid adding payment IDs, merchant IDs, or raw error messages as labels because they create high-cardinality metrics.

## Scrape Configuration

Configure Prometheus to scrape `/metrics` on the backend service and send the authentication header:

```sh
curl -H "X-Admin-Secret: ${ADMIN_SECRET}" http://backend:3000/metrics
```

Configure your Prometheus deployment or a trusted proxy to send the `X-Admin-Secret` header on scrapes; never expose the endpoint publicly.