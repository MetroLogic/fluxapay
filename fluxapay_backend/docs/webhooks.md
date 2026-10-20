# FluxaPay Webhooks Guide

Webhooks allow FluxaPay to notify your application when events occur, such as payments being confirmed or settlements completing.

## Delivery Guarantees

Every event carries a stable `event_id` in the payload. FluxaPay guarantees that a
given `event_id` is **delivered at most once** for a given event, even when several
producers race (for example the oracle tick and a manual verify running at the same
time, or a settlement retry re-running a batch).

- Concurrent deliveries of the same `event_id` are coalesced into a single request.
- The `event_id` column is uniquely indexed, so a second worker that races past the
  in-process guard loses the insert and drops its attempt instead of sending.
- If an event's previous delivery is still `pending`/`retrying`, an explicit re-send
  is allowed (that is a retry, not a duplicate).

You should still treat `event_id` as your idempotency key: store it and ignore any
event you have already processed. This protects you if a delivery is lost at the
network layer and later retried.

## Webhook Events

FluxaPay sends the following canonical event names in the `event` field:

| Event | When it is sent |
|-------|-----------------|
| `payment.created` | A payment is created |
| `payment.pending` | A payment is awaiting funds |
| `payment.confirmed` | An on-chain payment is confirmed |
| `payment.failed` | A payment fails |
| `payment.expired` | A payment expires before completion |
| `payment.expiring_soon` | A pending payment is nearing expiration |
| `payment.settled` | Funds are settled to the merchant |
| `payment.duplicate_received` | A duplicate payment is detected |
| `refund.created` | A refund is created |
| `refund.completed` | A refund completes successfully |
| `refund.failed` | A refund fails |
| `subscription.created` | A subscription is created |
| `subscription.cancelled` | A subscription is cancelled |
| `subscription.renewed` | A subscription renews |
| `invoice.paid` | An invoice is paid |
| `invoice.overdue` | An invoice becomes overdue |

Older integrations may still specify these legacy event names; FluxaPay maps them to the canonical names above:

| Legacy name | Canonical name |
|-------------|---------------|
| `payment_completed` | `payment.settled` |
| `payment_confirmed` | `payment.confirmed` |
| `payment_failed` | `payment.failed` |
| `payment_expired` | `payment.expired` |
| `payment_expiring_soon` | `payment.expiring_soon` |
| `payment_pending` | `payment.pending` |
| `payment_duplicate_received` | `payment.duplicate_received` |
| `refund_completed` | `refund.completed` |
| `refund_failed` | `refund.failed` |
| `subscription_created` | `subscription.created` |
| `subscription_cancelled` | `subscription.cancelled` |
| `subscription_renewed` | `subscription.renewed` |
| `invoice_paid` | `invoice.paid` |
| `invoice_overdue` | `invoice.overdue` |

## Event Payloads

Each delivery includes `event`, `event_id`, and `timestamp`. The remaining fields depend on the event and are sent at the top level; some existing payment events group their event-specific fields under `data`. Amounts are decimal strings in live payment events.

For example, a confirmed payment may look like:

```json
{
  "event": "payment.confirmed",
  "event_id": "e6b6a6a6-a1a4-4f85-9c7b-7c8f1d5c4a12",
  "timestamp": "2026-09-30T10:20:05.000Z",
  "payment_id": "pay_123",
  "amount": "49.99",
  "amount_received": "49.99",
  "currency": "USD",
  "status": "confirmed",
  "transaction_hash": "stellar_transaction_hash",
  "payer_address": "G..."
}
```

| Event family | Event-specific fields |
|--------------|-----------------------|
| `payment.created`, `payment.pending`, `payment.failed` | `payment_id`, `amount`, `currency`, `status`; `customer_email` and `failure_reason` may also be present |
| `payment.confirmed` | `payment_id`, `amount`, `amount_received`, `currency`, `status`, `transaction_hash`, `payer_address` |
| `payment.expired` | `data.charge_id`, `data.merchant_id`, `data.amount`, `data.currency`, `data.expired_at` |
| `payment.expiring_soon` | `payment_id`, `checkout_url`, `expires_at`, `minutes_remaining` |
| `payment.settled` | `payment_id`, `merchant_id`, `settlement_id`, `settlement`, `settled_at` |
| `payment.duplicate_received` | `payment_id`, `charge_id`, `expected_amount`, `total_received`, `surplus_amount`, `transaction_hashes`, `currency` |
| `refund.created`, `refund.completed`, `refund.failed` | `refund_id`, `payment_id`, `amount`, `currency`, `status`; failure details may be present for failed refunds |
| `subscription.created`, `subscription.renewed` | `subscription_id`, `plan_id`, `plan_slug`, `billing_cycle`, `current_period_end` or `renewed_at`, `next_billing_date` |
| `subscription.cancelled` | `subscription_id`, `plan_id`, `status`, `cancelled_at` |
| `invoice.paid`, `invoice.overdue` | `invoice_id`, `merchant_id`, `invoice_number`, `amount`, `currency`, `status`, `paid_at`, `payment_tx_hash`, `updated_at` |

Fields not applicable to an event are omitted. `event_id` is stable across retries, so use it to deduplicate deliveries. Test webhooks also include `webhook_id` and `test_mode: true`.

## Setting Up Webhooks

1. Navigate to your merchant dashboard
2. Go to Settings > Webhooks
3. Enter your webhook URL (must be publicly accessible)
4. Click "Save"

Your webhook endpoint should:
- Accept POST requests
- Return HTTP 200 OK within 10 seconds
- Handle JSON content type

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
| Initial delivery | Immediate |
| Retry 1 | 1 minute |
| Retry 2 | 2 minutes |
| Retry 3 | 4 minutes |

After three failed retries, the webhook is marked as failed. Check your dashboard for failed webhook logs.

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
    case 'payment.confirmed':
      handlePaymentCompleted(event);
      break;
    case 'payment.settled':
      handlePaymentSettled(event);
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
    
    if event['event'] == 'payment.confirmed':
      handle_payment_completed(event)
    
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
