# FluxaPay API reference: checkout and payment links

These guides cover the parts of the API that merchants touch when they take a payment:

| Guide | What it covers |
|-------|----------------|
| [Checkout sessions](./checkout-sessions.md) | Creating a payment (checkout session), the hosted checkout page, polling its status |
| [Payment links](./payment-links.md) | Reusable, shareable links: create, customise, list, update, deactivate, resolve |
| [Status callbacks and redirects](./status-callbacks-and-redirects.md) | Webhooks, signature verification, `success_url` / `cancel_url`, polling and SSE |

Every guide has copyable `curl` commands plus JavaScript, Python and Go samples.

## Try it interactively

The backend serves Swagger UI at **`/api-docs`** in non-production environments. Start the backend
locally (`cd fluxapay_backend && npm run dev`) and open <http://localhost:3000/api-docs> to send
real requests with your test key. The raw OpenAPI document is generated from the route annotations
and can be exported with `npm run openapi:export` (writes `fluxapay_backend/swagger.json`).

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://api.fluxapay.com` |
| Local development | `http://localhost:3000` |

All endpoints below are versioned under `/api/v1`.

## Authentication

Merchant endpoints take your secret API key in either header:

```http
Authorization: Bearer sk_live_xxxxxxxxxxxxxxxx
```

```http
x-api-key: sk_live_xxxxxxxxxxxxxxxx
```

`sk_test_...` keys work the same way against an isolated test-mode data partition. Never ship a
secret key to a browser or mobile app. The public checkout and payment-link resolution endpoints need
no key; they are designed to be called from the hosted checkout page.

The examples use these shell variables:

```bash
export FLUXAPAY_BASE_URL="https://api.fluxapay.com"
export FLUXAPAY_API_KEY="sk_test_xxxxxxxxxxxxxxxx"
```

## Idempotency

`POST /api/v1/payments` accepts an optional `Idempotency-Key` header (1–255 characters). Retrying with
the same key and the same body returns the original response instead of creating a second payment.
Reusing a key with a **different** body returns `422 IDEMPOTENCY_CONFLICT`.

## Error format

Every error response has the same JSON shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "errors": [
    { "field": "amount", "message": "Amount must be greater than 0" }
  ]
}
```

| Field | Type | Present when |
|-------|------|--------------|
| `code` | string | Always. Machine-readable; branch on this, not on `message`. |
| `message` | string | Always. Human-readable, may change. |
| `errors` | array of `{ field, message }` | Request validation failed. |
| `details` | object | Extra context, e.g. `kyc_status` for `KYC_REQUIRED`. |
| `retry_after_seconds` | integer | `429` and `503` responses (mirrors the `Retry-After` header). |

Every response, success or error, carries an `X-FluxaPay-Request-ID` header. Include it when you
contact support.

### Status codes

| Status | Meaning | Typical `code` values |
|--------|---------|-----------------------|
| `200 OK` | Request succeeded | |
| `201 Created` | Resource created | |
| `204 No Content` | Deleted / deactivated, no body | |
| `400 Bad Request` | Invalid input | `VALIDATION_ERROR`, `INVALID_AMOUNT`, `INVALID_METADATA`, `MISSING_REQUIRED_FIELD`, `INVALID_IDEMPOTENCY_KEY` |
| `401 Unauthorized` | Missing or bad credentials | `AUTHENTICATION_REQUIRED`, `INVALID_API_KEY`, `UNAUTHORIZED` |
| `403 Forbidden` | Authenticated but not allowed | `KYC_REQUIRED` (payment creation needs approved KYC) |
| `404 Not Found` | Unknown or not-owned resource | `PAYMENT_NOT_FOUND`, `PAYMENT_LINK_NOT_FOUND` |
| `410 Gone` | Payment link can no longer be paid | `PAYMENT_LINK_INACTIVE`, `PAYMENT_LINK_EXPIRED` |
| `413 Payload Too Large` | JSON body over 1 MB | `PAYLOAD_TOO_LARGE` |
| `422 Unprocessable Entity` | Idempotency key reused with a different body | `IDEMPOTENCY_CONFLICT` |
| `429 Too Many Requests` | Rate limited | `RATE_LIMIT_EXCEEDED`, `PAYMENT_RATE_LIMIT` |
| `500 Internal Server Error` | Unexpected server failure | `INTERNAL_ERROR`, `PAYMENT_CREATE_FAILED` |
| `502 Bad Gateway` | Upstream dependency failed | `FX_INVALID_RATE` |

## Rate limits

Authenticated routes are limited per API key (default 200 requests/minute). Public, unauthenticated
routes (checkout lookups, payment status, payment-link resolution) are limited per client IP with a
token bucket: you can burst up to the bucket size, then sustain the refill rate.

| Endpoint | Burst | Sustained |
|----------|-------|-----------|
| `GET /api/v1/payments/checkout/{id}` and `/checkout/{id}/status` | 60 | 2 req/s |
| `GET /api/v1/payments/{id}/status` | 30 | 1 req/s |
| `GET /api/v1/payments/{id}/stream` | 15 | 1 req / 2 s |
| `GET /api/v1/payment-links/resolve/{slug}` and `POST .../charge` | 30 | 1 req/s |

Responses from rate-limited routes include:

| Header | Meaning |
|--------|---------|
| `X-RateLimit-Limit` | Bucket size (max burst) |
| `X-RateLimit-Remaining` | Requests left right now |
| `X-RateLimit-Reset` | Unix time (seconds) when the bucket is full again |
| `Retry-After` | On `429` only: seconds until the next request will be accepted |

Back off for `Retry-After` seconds when you get a `429`.
