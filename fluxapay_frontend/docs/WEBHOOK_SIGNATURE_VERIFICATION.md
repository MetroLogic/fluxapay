# Webhook Signature Verification Guide

This guide explains how to verify webhook signatures from FluxaPay to ensure the authenticity and integrity of webhook payloads.

## Overview

All webhooks sent by FluxaPay are signed using HMAC-SHA256. This allows you to verify that:
1. The webhook came from FluxaPay (authenticity)
2. The payload hasn't been tampered with (integrity)
3. The webhook is fresh and not a replay attack (replay protection)

## Signing Format

Each webhook includes two headers:
- `X-FluxaPay-Signature`: The HMAC-SHA256 signature
- `X-FluxaPay-Timestamp`: ISO 8601 timestamp when the webhook was sent

The signature is computed over the concatenation of the timestamp and JSON payload:

```
signature = HMAC-SHA256(
  key: your_webhook_secret,
  message: "${timestamp}.${json_payload}"
)
```

### Example

Given:
- Webhook Secret: `whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
- Timestamp: `2026-03-25T14:30:00.000Z`
- Payload: `{"event":"payment_confirmed","payment_id":"pay_123"}`

The signing string would be:
```
2026-03-25T14:30:00.000Z.{"event":"payment_confirmed","payment_id":"pay_123"}
```

## Replay Protection

To prevent replay attacks, you should:

1. **Check the timestamp** is within an acceptable window (recommended: 5 minutes)
2. **Track processed webhook IDs** to prevent duplicate processing
3. **Reject old webhooks** outside your configured window

### Recommended Replay Protection Window

- **Default**: 5 minutes (300 seconds)
- **Minimum**: 1 minute (60 seconds)
- **Maximum**: 1 hour (3600 seconds)

## Implementation Examples

### Node.js / TypeScript

```typescript
import crypto from 'crypto';

interface WebhookVerificationOptions {
  replayProtectionWindowSeconds?: number;
  processedWebhookIds?: Set<string>;
}

function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string,
  options: WebhookVerificationOptions = {}
): { valid: boolean; error?: string } {
  const {
    replayProtectionWindowSeconds = 300,
    processedWebhookIds = new Set(),
  } = options;

  // 1. Verify timestamp is within acceptable window
  const webhookTime = new Date(timestamp).getTime();
  const currentTime = Date.now();
  const timeDiffSeconds = (currentTime - webhookTime) / 1000;

  if (timeDiffSeconds < 0) {
    return { valid: false, error: 'Webhook timestamp is in the future' };
  }

  if (timeDiffSeconds > replayProtectionWindowSeconds) {
    return {
      valid: false,
      error: `Webhook timestamp is older than ${replayProtectionWindowSeconds} seconds`,
    };
  }

  // 2. Compute expected signature
  const signingString = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signingString)
    .digest('hex');

  // 3. Compare signatures (constant-time comparison)
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    return { valid: false, error: 'Signature verification failed' };
  }

  return { valid: true };
}

// Express middleware example
import { Request, Response, NextFunction } from 'express';

export function verifyWebhookMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const signature = req.headers['x-fluxapay-signature'] as string;
  const timestamp = req.headers['x-fluxapay-timestamp'] as string;
  const secret = process.env.FLUXAPAY_WEBHOOK_SECRET;

  if (!signature || !timestamp || !secret) {
    return res.status(401).json({ error: 'Missing webhook headers or secret' });
  }

  const payload = JSON.stringify(req.body);
  const verification = verifyWebhookSignature(
    payload,
    signature,
    timestamp,
    secret,
    { replayProtectionWindowSeconds: 300 }
  );

  if (!verification.valid) {
    return res.status(401).json({ error: verification.error });
  }

  next();
}

// Usage in Express app
app.post('/webhooks/fluxapay', verifyWebhookMiddleware, (req, res) => {
  const { event, data } = req.body;
  
  // Process webhook
  console.log(`Received verified webhook: ${event}`);
  
  res.status(200).json({ received: true });
});
```

### Python

```python
import hmac
import hashlib
import json
from datetime import datetime, timedelta
from typing import Dict, Optional, Set

def verify_webhook_signature(
    payload: str,
    signature: str,
    timestamp: str,
    secret: str,
    replay_protection_window_seconds: int = 300,
    processed_webhook_ids: Optional[Set[str]] = None
) -> Dict[str, any]:
    """
    Verify a FluxaPay webhook signature.
    
    Args:
        payload: Raw JSON payload as string
        signature: Signature from X-FluxaPay-Signature header
        timestamp: Timestamp from X-FluxaPay-Timestamp header
        secret: Your webhook secret (whsec_...)
        replay_protection_window_seconds: Max age of webhook in seconds
        processed_webhook_ids: Set of already processed webhook IDs
    
    Returns:
        Dict with 'valid' boolean and optional 'error' message
    """
    
    # 1. Verify timestamp is within acceptable window
    try:
        webhook_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    except ValueError:
        return {'valid': False, 'error': 'Invalid timestamp format'}
    
    current_time = datetime.now(webhook_time.tzinfo)
    time_diff = (current_time - webhook_time).total_seconds()
    
    if time_diff < 0:
        return {'valid': False, 'error': 'Webhook timestamp is in the future'}
    
    if time_diff > replay_protection_window_seconds:
        return {
            'valid': False,
            'error': f'Webhook timestamp is older than {replay_protection_window_seconds} seconds'
        }
    
    # 2. Compute expected signature
    signing_string = f"{timestamp}.{payload}"
    expected_signature = hmac.new(
        secret.encode(),
        signing_string.encode(),
        hashlib.sha256
    ).hexdigest()
    
    # 3. Compare signatures (constant-time comparison)
    if not hmac.compare_digest(signature, expected_signature):
        return {'valid': False, 'error': 'Signature verification failed'}
    
    return {'valid': True}


# Flask example
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/webhooks/fluxapay', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-FluxaPay-Signature')
    timestamp = request.headers.get('X-FluxaPay-Timestamp')
    secret = os.getenv('FLUXAPAY_WEBHOOK_SECRET')
    
    if not signature or not timestamp or not secret:
        return jsonify({'error': 'Missing webhook headers or secret'}), 401
    
    payload = request.get_data(as_text=True)
    verification = verify_webhook_signature(
        payload,
        signature,
        timestamp,
        secret,
        replay_protection_window_seconds=300
    )
    
    if not verification['valid']:
        return jsonify({'error': verification['error']}), 401
    
    # Process webhook
    data = request.get_json()
    event = data.get('event')
    print(f"Received verified webhook: {event}")
    
    return jsonify({'received': True}), 200
```

## Testing Webhook Signatures

### Using cURL

```bash
# Generate a test signature
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
PAYLOAD='{"event":"payment_confirmed","payment_id":"pay_123"}'
SECRET="whsec_your_webhook_secret"

# Create signing string
SIGNING_STRING="${TIMESTAMP}.${PAYLOAD}"

# Generate HMAC-SHA256 signature
SIGNATURE=$(echo -n "$SIGNING_STRING" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# Send webhook
curl -X POST https://your-domain.com/webhooks/fluxapay \
  -H "Content-Type: application/json" \
  -H "X-FluxaPay-Signature: $SIGNATURE" \
  -H "X-FluxaPay-Timestamp: $TIMESTAMP" \
  -d "$PAYLOAD"
```

### Using Node.js Test Script

```typescript
import crypto from 'crypto';
import fetch from 'node-fetch';

async function testWebhookSignature(
  webhookUrl: string,
  secret: string,
  payload: Record<string, any>
) {
  const timestamp = new Date().toISOString();
  const payloadString = JSON.stringify(payload);
  const signingString = `${timestamp}.${payloadString}`;
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingString)
    .digest('hex');
  
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FluxaPay-Signature': signature,
      'X-FluxaPay-Timestamp': timestamp,
    },
    body: payloadString,
  });
  
  console.log(`Status: ${response.status}`);
  console.log(`Response: ${await response.text()}`);
}

// Test
testWebhookSignature(
  'http://localhost:3000/webhooks/fluxapay',
  'whsec_test_secret',
  {
    event: 'payment_confirmed',
    payment_id: 'pay_123',
    amount: '100.00',
    currency: 'USDC',
  }
);
```

## Common Issues & Troubleshooting

### Signature Mismatch

**Problem**: Signature verification fails even with correct secret

**Solutions**:
1. Ensure you're using the raw JSON string, not a parsed object
2. Verify the timestamp format is ISO 8601 with milliseconds
3. Check that the signing string format is exactly: `${timestamp}.${payload}`
4. Ensure no extra whitespace in the JSON payload

### Timestamp Validation Failures

**Problem**: Webhooks rejected as too old

**Solutions**:
1. Ensure server clocks are synchronized (use NTP)
2. Increase replay protection window if needed
3. Check that timestamp parsing handles timezone correctly

### Replay Attack Concerns

**Best Practices**:
1. Always validate timestamp freshness
2. Store processed webhook IDs in a database or cache
3. Implement idempotency keys for webhook processing
4. Use a reasonable replay protection window (5-10 minutes)

## Security Checklist

- [ ] Store webhook secret securely (use environment variables)
- [ ] Never log webhook secrets
- [ ] Use constant-time comparison for signatures
- [ ] Validate timestamp freshness
- [ ] Track processed webhook IDs
- [ ] Use HTTPS for webhook endpoints
- [ ] Implement rate limiting on webhook endpoints
- [ ] Log all webhook verification failures
- [ ] Regularly rotate webhook secrets if compromised

## API Reference

### Webhook Headers

| Header | Description | Example |
|--------|-------------|---------|
| `X-FluxaPay-Signature` | HMAC-SHA256 signature in hex format | `a1b2c3d4e5f6...` |
| `X-FluxaPay-Timestamp` | ISO 8601 timestamp when webhook was sent | `2026-03-25T14:30:00.000Z` |

### Webhook Payload Structure

```json
{
  "event": "payment_confirmed",
  "timestamp": "2026-03-25T14:30:00.000Z",
  "data": {
    "payment_id": "pay_123",
    "merchant_id": "merchant_456",
    "amount": "100.00",
    "currency": "USDC",
    "status": "confirmed"
  }
}
```

## Support

For issues or questions about webhook signature verification:
1. Check this documentation
2. Review the troubleshooting section
3. Contact support with webhook logs and error messages
