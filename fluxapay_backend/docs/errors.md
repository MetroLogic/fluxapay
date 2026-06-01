# FluxaPay API Error Codes

Reference for all error codes returned by the FluxaPay API.

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 204 | No Content - Request successful, no content returned |
| 400 | Bad Request - Invalid request parameters |
| 401 | Unauthorized - Invalid or missing API key |
| 404 | Not Found - Resource not found |
| 422 | Unprocessable Entity - Request validation failed |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |

## Error Response Format

All errors follow this format:

```json
{
  "error": "Error message description",
  "code": "ERROR_CODE",
  "details": { /* additional context */ }
}
```

## Common Error Codes

### Authentication Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `INVALID_API_KEY` | 401 | Invalid or missing API key | Check your API key is correct and active |
| `API_KEY_REVOKED` | 401 | API key has been revoked | Generate a new API key |
| `API_KEY_EXPIRED` | 401 | API key has expired | Generate a new API key |
| `MERCHANT_INACTIVE` | 401 | Merchant account is inactive | Contact support to activate your account |

### Payment Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `PAYMENT_NOT_FOUND` | 404 | Payment not found | Verify the payment ID is correct |
| `PAYMENT_EXPIRED` | 400 | Payment has expired | Create a new payment |
| `PAYMENT_ALREADY_CONFIRMED` | 400 | Payment already confirmed | Payment cannot be modified |
| `INVALID_AMOUNT` | 400 | Invalid amount | Amount must be positive and within limits |
| `INVALID_CURRENCY` | 400 | Invalid currency | Use supported currencies (USDC, etc.) |
| `INVALID_EMAIL` | 400 | Invalid email address | Provide a valid email address |

### Rate Limit Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded | Wait and retry (check Retry-After header) |
| `PAYMENT_RATE_LIMIT` | 429 | Payment creation rate limit exceeded | Reduce payment creation frequency |
| `API_KEY_RATE_LIMIT` | 429 | API key creation rate limit exceeded | Wait before creating more keys |

### Validation Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `INVALID_REQUEST_BODY` | 400 | Invalid request body | Check JSON syntax and required fields |
| `MISSING_REQUIRED_FIELD` | 400 | Missing required field | Include all required fields |
| `INVALID_METADATA` | 400 | Invalid metadata format | Metadata must be valid JSON |
| `METADATA_TOO_LARGE` | 400 | Metadata exceeds size limit | Reduce metadata size (max 16KB) |

### Settlement Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `SETTLEMENT_NOT_FOUND` | 404 | Settlement not found | Verify the settlement ID |
| `SETTLEMENT_FAILED` | 500 | Settlement processing failed | Contact support |
| `NO_BANK_ACCOUNT` | 400 | No bank account on file | Add bank account in merchant settings |
| `INVALID_BANK_ACCOUNT` | 400 | Invalid bank account details | Update bank account information |

### API Key Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `API_KEY_NOT_FOUND` | 404 | API key not found | Verify the key ID |
| `API_KEY_ALREADY_REVOKED` | 400 | API key already revoked | Key is already inactive |
| `MAX_ACTIVE_KEYS` | 422 | Maximum active keys reached | Revoke old keys or contact support |
| `INVALID_ENVIRONMENT` | 400 | Invalid environment | Use 'live' or 'test' |

### Webhook Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `INVALID_WEBHOOK_URL` | 400 | Invalid webhook URL | Provide a valid HTTPS URL |
| `WEBHOOK_DELIVERY_FAILED` | 500 | Webhook delivery failed | Check your webhook endpoint is accessible |

### KYC Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `KYC_ALREADY_SUBMITTED` | 400 | KYC already submitted | KYC is already in progress |
| `KYC_NOT_FOUND` | 404 | KYC not found | Submit KYC documents first |
| `KYC_APPROVED` | 400 | KYC already approved | No action needed |
| `KYC_REJECTED` | 400 | KYC rejected | Submit corrected documents |

### Refund Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `REFUND_NOT_FOUND` | 404 | Refund not found | Verify the refund ID |
| `REFUND_ALREADY_PROCESSED` | 400 | Refund already processed | Refund cannot be modified |
| `INSUFFICIENT_FUNDS` | 400 | Insufficient funds for refund | Ensure sufficient balance |
| `REFUND_PERIOD_EXPIRED` | 400 | Refund period expired | Refunds must be requested within 30 days |

### Invoice Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `INVOICE_NOT_FOUND` | 404 | Invoice not found | Verify the invoice ID |
| `INVOICE_ALREADY_PAID` | 400 | Invoice already paid | Invoice cannot be modified |
| `INVOICE_VOIDED` | 400 | Invoice is voided | Create a new invoice |

## Server Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `INTERNAL_ERROR` | 500 | Internal server error | Retry the request or contact support |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | Retry after a few minutes |
| `DATABASE_ERROR` | 500 | Database error | Contact support |

## Handling Errors

### Retry Strategy

- **429 (Rate Limit)**: Exponential backoff, respect Retry-After header
- **500 (Server Error)**: Retry with exponential backoff (up to 3 attempts)
- **4xx (Client Error)**: Do not retry, fix the request

### Example Error Handling

```javascript
try {
  const response = await fetch('https://api.fluxapay.com/api/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(paymentData),
  });
  
  if (!response.ok) {
    const error = await response.json();
    
    switch (response.status) {
      case 401:
        console.error('Authentication failed:', error.error);
        // Prompt user to re-authenticate
        break;
      case 429:
        const retryAfter = response.headers.get('Retry-After');
        console.error(`Rate limited. Retry after ${retryAfter} seconds`);
        // Implement retry logic
        break;
      case 422:
        console.error('Validation error:', error.error);
        // Show validation errors to user
        break;
      default:
        console.error('API error:', error.error);
    }
    
    throw new Error(error.error);
  }
  
  return await response.json();
} catch (error) {
  console.error('Request failed:', error);
  throw error;
}
```

## Getting Help

If you encounter an error not listed here:

1. Check the [API documentation](https://docs.fluxapay.com)
2. Review your request parameters
3. Check the [status page](https://status.fluxapay.com) for outages
4. Contact support at support@fluxapay.com

When contacting support, include:
- The error code and message
- The request ID (from response headers)
- Timestamp of the error
- Request parameters (sanitized)
