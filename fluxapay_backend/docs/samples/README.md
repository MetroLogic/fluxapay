# FluxaPay Webhook Verification Samples

This directory contains copy-paste ready code samples for verifying FluxaPay webhook signatures in different programming languages.

## Quick Start

1. **Get your webhook secret** from your FluxaPay merchant dashboard
2. **Choose your language** below
3. **Copy the sample code** to your project
4. **Adapt it** to your framework and business logic

## Available Samples

### Node.js / TypeScript
**File**: `webhook-verification.node.ts`

**Features**:
- Express middleware for automatic verification
- Manual verification function
- Constant-time signature comparison (prevents timing attacks)
- Replay protection with configurable window
- TypeScript types included
- Example event handlers

**Quick Example**:
```typescript
import { verifyWebhookMiddleware, handleWebhook } from './webhook-verification.node';

app.post('/webhooks/fluxapay', verifyWebhookMiddleware, handleWebhook);
```

**Requirements**:
- Node.js 14+
- Express.js
- TypeScript (optional, can be used as JavaScript)

---

### Python
**File**: `webhook_verification.py`

**Features**:
- Flask example with full webhook handler
- FastAPI example with async support
- Decorator pattern for easy integration
- Constant-time signature comparison
- Replay protection with configurable window
- Event handler examples
- Testing utilities

**Quick Example with Flask**:
```python
from flask import Flask
from webhook_verification import create_flask_webhook_handler

app = create_flask_webhook_handler()
```

**Quick Example with FastAPI**:
```python
from fastapi import FastAPI
from webhook_verification import create_fastapi_webhook_handler

app = create_fastapi_webhook_handler()
```

**Requirements**:
- Python 3.7+
- Flask (for Flask example) or FastAPI (for FastAPI example)

---

## Implementation Steps

### Step 1: Set Environment Variable

Store your webhook secret securely:

```bash
# .env file
FLUXAPAY_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Step 2: Copy Sample Code

Choose the appropriate sample for your language and copy it to your project.

### Step 3: Integrate with Your Framework

#### Express.js (Node.js)
```typescript
import express from 'express';
import { verifyWebhookMiddleware, handleWebhook } from './webhook-verification';

const app = express();
app.use(express.json());

// Important: Use raw body middleware for signature verification
app.post('/webhooks/fluxapay', 
  express.raw({ type: 'application/json' }),
  verifyWebhookMiddleware,
  handleWebhook
);

app.listen(3000);
```

#### Flask (Python)
```python
from flask import Flask
from webhook_verification import create_flask_webhook_handler

app = create_flask_webhook_handler()

if __name__ == '__main__':
    app.run(port=3000)
```

#### FastAPI (Python)
```python
from fastapi import FastAPI
from webhook_verification import create_fastapi_webhook_handler

app = create_fastapi_webhook_handler()

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=3000)
```

### Step 4: Implement Event Handlers

Customize the event handlers for your business logic:

**Node.js**:
```typescript
async function handlePaymentConfirmed(data: any): Promise<void> {
  // Update your database
  // Send confirmation email
  // Trigger fulfillment
  console.log('Payment confirmed:', data.payment_id);
}
```

**Python**:
```python
def handle_payment_confirmed(data: dict) -> None:
    # Update your database
    # Send confirmation email
    # Trigger fulfillment
    print(f'Payment confirmed: {data["payment_id"]}')
```

### Step 5: Test Your Implementation

#### Using cURL

```bash
# Generate test signature
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
PAYLOAD='{"event":"payment_confirmed","data":{"payment_id":"pay_123"}}'
SECRET="whsec_your_webhook_secret"

SIGNING_STRING="${TIMESTAMP}.${PAYLOAD}"
SIGNATURE=$(echo -n "$SIGNING_STRING" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# Send test webhook
curl -X POST http://localhost:3000/webhooks/fluxapay \
  -H "Content-Type: application/json" \
  -H "X-FluxaPay-Signature: $SIGNATURE" \
  -H "X-FluxaPay-Timestamp: $TIMESTAMP" \
  -d "$PAYLOAD"
```

#### Using Node.js Test Script

```typescript
import { generateTestWebhookSignature } from './webhook-verification.node';
import fetch from 'node-fetch';

const payload = {
  event: 'payment_confirmed',
  data: { payment_id: 'pay_123' }
};

const { signature, timestamp } = generateTestWebhookSignature(
  payload,
  'whsec_your_webhook_secret'
);

const response = await fetch('http://localhost:3000/webhooks/fluxapay', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-FluxaPay-Signature': signature,
    'X-FluxaPay-Timestamp': timestamp,
  },
  body: JSON.stringify(payload),
});

console.log(response.status);
```

#### Using Python Test Script

```python
from webhook_verification import generate_test_webhook_signature
import requests

payload = {
    'event': 'payment_confirmed',
    'data': {'payment_id': 'pay_123'}
}

result = generate_test_webhook_signature(
    payload,
    'whsec_your_webhook_secret'
)

response = requests.post(
    'http://localhost:3000/webhooks/fluxapay',
    json=payload,
    headers={
        'X-FluxaPay-Signature': result['signature'],
        'X-FluxaPay-Timestamp': result['timestamp'],
    }
)

print(response.status_code)
```

## Security Best Practices

### ✅ Do's

- ✅ Store webhook secrets in environment variables
- ✅ Use constant-time comparison for signatures
- ✅ Validate timestamp freshness (5-10 minute window)
- ✅ Use HTTPS for webhook endpoints
- ✅ Log webhook verification failures
- ✅ Implement idempotency for webhook processing
- ✅ Track processed webhook IDs to prevent duplicates
- ✅ Use rate limiting on webhook endpoints

### ❌ Don'ts

- ❌ Don't hardcode webhook secrets in code
- ❌ Don't log webhook secrets
- ❌ Don't use simple string comparison for signatures
- ❌ Don't skip timestamp validation
- ❌ Don't process webhooks without verification
- ❌ Don't expose webhook secrets in error messages
- ❌ Don't use HTTP for webhook endpoints

## Troubleshooting

### Signature Verification Fails

**Check**:
1. Webhook secret is correct and matches your dashboard
2. Raw JSON payload is used (not parsed object)
3. Timestamp format is ISO 8601 with milliseconds
4. Signing string format is exactly: `${timestamp}.${payload}`
5. No extra whitespace in JSON

### Timestamp Validation Fails

**Check**:
1. Server clock is synchronized (use NTP)
2. Timezone handling is correct
3. Replay protection window is appropriate for your use case

### Webhooks Not Being Received

**Check**:
1. Webhook endpoint is publicly accessible
2. Endpoint is registered in FluxaPay dashboard
3. Firewall/security groups allow incoming traffic
4. Server is running and listening on correct port
5. Check server logs for errors

## Common Webhook Events

| Event | Description |
|-------|-------------|
| `payment_confirmed` | Payment has been confirmed on-chain |
| `payment_failed` | Payment failed or was rejected |
| `payment_pending` | Payment is pending confirmation |
| `refund_completed` | Refund has been processed |
| `refund_failed` | Refund failed |
| `subscription_created` | New subscription created |
| `subscription_cancelled` | Subscription cancelled |
| `subscription_renewed` | Subscription renewed |

## Support

For issues or questions:
1. Check the main [WEBHOOK_SIGNATURE_VERIFICATION.md](../WEBHOOK_SIGNATURE_VERIFICATION.md) guide
2. Review the troubleshooting section above
3. Check your server logs for error messages
4. Contact FluxaPay support with webhook logs

## License

These samples are provided as-is for use with FluxaPay webhooks.
