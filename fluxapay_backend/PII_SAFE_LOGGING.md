# PII-Safe Logging — Enforced Redaction Rules

## Overview

All request bodies, query parameters, and log contexts are automatically
scrubbed of sensitive data **at the source** — regardless of log level
(debug, info, warn, error). No call-site diligence is required.

---

## Enforced Redaction Rules (always applied, all log levels)

### 1. Request Body & Query Parameters

The following fields are **always** redacted with `[REDACTED]`, regardless
of nesting depth, via `redactRequestBody()` / `sanitizeObject()`:

| Field pattern (case-insensitive substring match) | Example values redacted |
|---|---|
| `password` | `password`, `old_password`, `new_password` |
| `secret` | `secret`, `webhook_secret` |
| `secret_key` | `secret_key`, `api_secret_key` |
| `token` | `token`, `access_token`, `refresh_token` |
| `apiKey` / `api_key` | `apiKey`, `api_key`, `x_api_key` |
| `authorization` | embedded authorization objects |
| `creditCard` / `credit_card` | full card numbers |
| `cvv` | card verification values |
| `pin` | PINs |
| `account_number` / `accountNumber` | bank / wallet account numbers |
| `account_name` / `accountName` | account holder names |
| `email` | email addresses |
| `phone_number` / `phone` | phone numbers |

### 2. Authorization Header (All Request Logs)

The `Authorization` HTTP header value is **always** redacted in every
request log line via `redactAuthHeader()`. The format retained for debugging:

| Auth scheme | Log output |
|---|---|
| `Bearer <jwt>` | `Bearer eyJh...xYzA` (first 4 + last 4 chars) |
| `Basic <creds>` | `Basic dXNl...cmQ=` |
| `AccessKey <key>` | `AccessKey ABCD...IJKL` |
| Unknown scheme | `[REDACTED]` |
| Missing header | `[REDACTED]` |

### 3. Logger Context Auto-Sanitization

`logger.ts` calls `redactRequestContext()` on every merged context object
before emitting the JSON log entry. This means **any** call to
`logger.debug(...)`, `logger.info(...)`, etc. that accidentally passes an
`authorization` or `x-api-key` field will have it stripped automatically.

---

## API — PII Utility Functions (`src/utils/piiRedactor.ts`)

| Function | Purpose |
|---|---|
| `sanitizeObject(obj, extraFields?)` | Deep-redact sensitive fields from any object |
| `redactRequestBody(body)` | Convenience wrapper over `sanitizeObject` for request bodies |
| `redactRequestContext(ctx)` | Redact `authorization` / `x-api-key` from log context objects |
| `redactAuthHeader(header)` | Redact an Authorization header value |
| `redactApiKey(key)` | Redact an API key (keep last 4 chars) |
| `redactEmail(email)` | Partially redact email (`jo***@domain.com`) |
| `hashMerchantId(id)` | SHA-256 hash merchantId for log correlation |
| `redactToken(token)` | Redact a JWT / session token |

---

## Example Log Output

### Normal Request (Info Level)
```json
{
  "level": "info",
  "message": "HTTP Request",
  "timestamp": "2026-03-30T12:34:56.789Z",
  "context": {
    "requestId": "abc-123-def-456",
    "method": "POST",
    "path": "/api/v1/payments",
    "merchantIdHash": "a1b2c3d4e5f6g7h8",
    "statusCode": 200,
    "responseTime": 245.67,
    "userAgent": "Mozilla",
    "ip": "192.168.1.1",
    "authorization": "Bearer eyJh...xYzA",
    "hasApiKey": true,
    "body": { "amount": 50, "currency": "USDC", "api_key": "[REDACTED]", "email": "[REDACTED]" },
    "contentLength": 1024,
    "responseSize": 512
  }
}
```

### Slow Request (Warning Level — >1s)
```json
{
  "level": "warn",
  "message": "Slow request detected",
  "context": {
    "requestId": "xyz-789",
    "method": "GET",
    "path": "/api/v1/merchants/reports",
    "merchantIdHash": "h8g7f6e5d4c3b2a1",
    "responseTime": 1523.45,
    "threshold": 1000
  }
}
```

---

## Files Created / Modified

| File | Change |
|---|---|
| `src/utils/piiRedactor.ts` | Added `secret_key` to always-redacted list; added `redactRequestBody`, `redactRequestContext` |
| `src/utils/__tests__/piiRedactor.test.ts` | Added tests for new helpers and all sensitive field patterns |
| `src/middleware/requestLogging.middleware.ts` | Uses `redactRequestBody` for body/query; uses `redactEmail` for user email |
| `src/utils/logger.ts` | Automatically calls `redactRequestContext` on every log context before emit |

---

## Testing

```bash
cd fluxapay_backend
npx jest --testPathPattern=piiRedactor.test.ts
```

All tests pass ✅

---

## Security Notes

1. **No secrets in logs**: Authorization headers, API keys, tokens — always redacted at logger level
2. **secret_key explicitly blocked**: Added as a first-class always-redacted field
3. **Hashed identifiers**: Merchant IDs use SHA-256 + salt for log correlation without PII exposure
4. **Email redaction**: Emails show only partial username and domain (`jo***@example.com`)
5. **Auto-sanitization in logger**: Even if a developer accidentally passes sensitive data in a log context, `redactRequestContext` strips it before the JSON is emitted

---

## Monitoring Recommendations

1. **Alert on slow requests**: `http_slow_requests_total`
2. **Track error rates**: `http_errors_total` for 4xx/5xx responses
3. **Performance trends**: `http_request_duration_ms` histogram — P95/P99 latencies
4. **Correlation**: Use `requestId` + `merchantIdHash` to trace requests across services
