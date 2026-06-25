# FluxaPay Webhooks Guide

Webhooks allow FluxaPay to notify your application when events occur, such as payments being confirmed or settlements completing.

## Webhook Events

### Payment Events

| Event | Description |
|-------|-------------|
| `payment.completed` | Payment successfully confirmed on-chain |
| `payment.failed` | Payment failed or expired |
| `payment.pending` | Payment created, awaiting funds |
| `payment.expired` | Payment expired before completion |
| `payment.partially_paid` | Payment received partial amount |
| `payment.overpaid` | Payment received more than required |
| `payment.settled` | Payment settled to local currency |

### Settlement Events

| Event | Description |
|-------|-------------|
| `settlement.completed` | Settlement batch completed successfully |
| `settlement.failed` | Settlement batch failed |

### Refund Events

| Event | Description |
|-------|-------------|
| `refund.completed` | Refund processed successfully |
| `refund.failed` | Refund failed |

### Subscription Events

| Event | Description |
|-------|-------------|
| `subscription.created` | Subscription created |
| `subscription.cancelled` | Subscription cancelled |
| `subscription.renewed` | Subscription renewed |

### Invoice Events

| Event | Description |
|-------|-------------|
| `invoice.paid` | Invoice paid |
| `invoice.overdue` | Invoice overdue |

## Setting Up Webhooks

1. Navigate to your merchant dashboard
2. Go to Settings > Webhooks
3. Enter your webhook URL (must be publicly accessible)
4. Click "Save"

Your webhook endpoint should:
- Accept POST requests
- Return HTTP 200 OK within 10 seconds
- Handle JSON content type

## Webhook Payload Structure

All webhooks follow this structure:

```json
{
  "event": "payment.completed",
  "data": { /* event-specific data */ },
  "timestamp": "2026-06-01T10:20:05Z"
}
```

## Signature Verification

To verify webhooks are genuinely from FluxaPay:

1. Retrieve your webhook secret from the dashboard
2. Compute HMAC-SHA256 of the raw request body using your secret
3. Compare with the `X-FluxaPay-Signature` header

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Usage
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-fluxapay-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, YOUR_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook...
});
```

## Retry Behavior

FluxaPay retries failed webhook deliveries with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After 5 failed attempts, the webhook is marked as failed. Check your dashboard for failed webhook logs.

## Example Webhook Handlers

### Node.js/Express

```javascript
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-fluxapay-signature'];
  
  if (!verifyWebhookSignature(req.body, signature, WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  const event = JSON.parse(req.body.toString());
  
  switch (event.event) {
    case 'payment.completed':
      handlePaymentCompleted(event.data);
      break;
    case 'payment.settled':
      handlePaymentSettled(event.data);
      break;
    default:
      console.log('Unhandled event:', event.event);
  }
  
  res.status(200).send();
});
```

### Python/Flask

```python
from flask import Flask, request, jsonify
import hmac
import hashlib

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-FluxaPay-Signature')
    payload = request.get_data()
    
    expected_signature = hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, expected_signature):
        return jsonify({'error': 'Invalid signature'}), 401
    
    event = request.json
    
    if event['event'] == 'payment.completed':
        handle_payment_completed(event['data'])
    
    return jsonify({'status': 'ok'}), 200
```

## Testing Webhooks

Use the FluxaPay dashboard to:
- Send test webhooks to your endpoint
- View webhook delivery logs
- Retry failed webhooks

For local development, use tools like:
- ngrok (https://ngrok.com) - expose localhost to the internet
- webhook.site - temporary webhook URLs for testing

## Best Practices

1. **Always verify signatures** - Never trust webhook payloads without signature verification
2. **Return quickly** - Your endpoint should respond within 10 seconds
3. **Handle idempotency** - Process duplicate events gracefully using event IDs
4. **Log all webhooks** - Keep logs for debugging and audit trails
5. **Use HTTPS** - Always use HTTPS for your webhook URLs in production
6. **Monitor failures** - Set up alerts for failed webhook deliveries

## Security Considerations

- Never expose your webhook secret
- Use HTTPS in production
- Implement rate limiting on your webhook endpoint
- Validate all webhook data before processing
- Keep webhook secrets rotated regularly
