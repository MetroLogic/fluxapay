# PII-Safe Access Logs Implementation

## Overview
Production logs now redact sensitive data and provide enhanced slow request warnings.

## Features Implemented

### 1. PII Redaction
- ✅ Authorization headers (Bearer, Basic, AccessKey) are redacted
- ✅ API keys show only last 4 characters
- ✅ Merchant IDs are hashed for correlation without exposing PII
- ✅ Email addresses are partially redacted (e.g., `jo***@example.com`)
- ✅ Request/response bodies can be sanitized to remove sensitive fields

### 2. Enhanced Slow Request Warnings
- ✅ **Warning level** for requests > 1 second
- ✅ **Error level** for critical slow requests > 5 seconds
- ✅ Detailed handler information including route, handler name, method, status code
- ✅ Query and body parameter counts for debugging

### 3. Additional Logging Improvements
- ✅ Content length (request size)
- ✅ Response size
- ✅ User agent (browser name only)
- ✅ IP address
- ✅ Request ID for tracing
- ✅ Hashed merchant ID for correlation

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
    "authorization": "Bearer eyJh...xYz",
    "hasApiKey": true,
    "contentLength": 1024,
    "responseSize": 512
  }
}
```

### Slow Request (Warning Level - >1s)
```json
{
  "level": "warn",
  "message": "Slow request detected",
  "timestamp": "2026-03-30T12:35:00.123Z",
  "context": {
    "requestId": "xyz-789-uvw-012",
    "method": "GET",
    "path": "/api/v1/merchants/reports",
    "merchantIdHash": "h8g7f6e5d4c3b2a1",
    "responseTime": 1523.45,
    "threshold": 1000,
    "route": "/api/v1/merchants/reports",
    "handler": "getMerchantReports",
    "statusCode": 200,
    "contentLength": "2048",
    "queryParamCount": 3,
    "bodyParamCount": 0
  }
}
```

### Critical Slow Request (Error Level - >5s)
```json
{
  "level": "error",
  "message": "Critical slow request detected",
  "timestamp": "2026-03-30T12:36:00.456Z",
  "context": {
    "requestId": "slow-req-123",
    "method": "POST",
    "path": "/api/v1/settlements/batch",
    "merchantIdHash": "m1n2o3p4q5r6s7t8",
    "responseTime": 5678.90,
    "threshold": 5000,
    "route": "/api/v1/settlements/batch",
    "handler": "createSettlementBatch",
    "method": "POST",
    "statusCode": 201
  }
}
```

## Files Created/Modified

### New Files
- `src/utils/piiRedactor.ts` - PII redaction utilities
- `src/utils/__tests__/piiRedactor.test.ts` - Unit tests for redaction functions

### Modified Files
- `src/middleware/requestLogging.middleware.ts` - Enhanced with PII redaction and slow request warnings

## Technical Requirements Met

✅ **Redact Authorization headers and tokens**
- All auth header formats supported (Bearer, Basic, AccessKey)
- Tokens show only first 4 and last 4 chars for debugging

✅ **Log route, status, duration, merchantId hash**
- Route path logged
- Status code logged
- Response time in milliseconds
- Merchant ID hashed with SHA-256 + salt

✅ **Warn on slow handlers (>1s)**
- Warning at 1 second threshold
- Error at 5 second threshold
- Detailed context for debugging

## Testing

Run the test suite:
```bash
cd fluxapay_backend
npm test -- piiRedactor.test.ts
```

All 24 tests pass ✅

## Security Notes

1. **No secrets in logs**: Authorization headers, API keys, and tokens are always redacted
2. **Hashed identifiers**: Merchant IDs use consistent hashing for log correlation without PII exposure
3. **Email redaction**: Emails show only partial username and domain
4. **Body sanitization**: Utility function available to sanitize request/response bodies

## Usage in Production

The logging middleware is already integrated in `src/app.ts`. No additional configuration needed.

To adjust log levels, set the environment variable:
```bash
LOG_LEVEL=info  # debug, info, warn, error
```

## Monitoring Recommendations

1. **Alert on slow requests**: Set up alerts for the `http_slow_requests_total` metric
2. **Track error rates**: Monitor `http_errors_total` for 4xx/5xx responses
3. **Performance trends**: Use `http_request_duration_ms` histogram to track P95/P99 latencies
4. **Correlation**: Use `requestId` and `merchantIdHash` to trace requests across services
