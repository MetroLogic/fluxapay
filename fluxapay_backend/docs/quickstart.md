# FluxaPay Developer Quickstart Guide

Get your first payment working in under 15 minutes.

## Prerequisites

- Node.js 18+ installed
- A FluxaPay testnet account (sign up at https://testnet.fluxapay.com)
- Basic knowledge of REST APIs

## Step 1: Get Your Test API Key

1. Log in to your FluxaPay testnet dashboard
2. Navigate to Settings > API Keys
3. Click "Create New Key"
4. Name it "Test Quickstart"
5. Select environment: `test`
6. Copy the key - you'll only see it once! It will look like: `fpk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Create a Test Payment

Use the FluxaPay API to create a payment:

```bash
curl -X POST https://testnet-api.fluxapay.com/api/v1/payments \
  -H "Authorization: Bearer fpk_test_YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10.50,
    "currency": "USDC",
    "customer_email": "customer@example.com",
    "description": "Test payment"
  }'
```

Response:
```json
{
  "id": "pay_abc123xyz",
  "amount": 10.50,
  "currency": "USDC",
  "status": "pending",
  "customer_email": "customer@example.com",
  "checkout_url": "https://pay.fluxapay.com/pay/pay_abc123xyz",
  "stellar_address": "GBUQWP3BOUZX34ULNQG23RQ6F5DOBAB4NSTOF5AUFF6GPBK476QC6G5",
  "expiration": "2026-06-01T10:30:00Z",
  "created_at": "2026-06-01T10:15:00Z"
}
```

## Step 3: Simulate a Payment on Testnet

1. Open the `checkout_url` from the response in your browser
2. You'll see the payment page with the Stellar address
3. On testnet, use the [Stellar Testnet Faucet](https://faucet.testnet.stellar.org/) to get test USDC
4. Send 10.50 USDC to the displayed Stellar address
5. The payment status will update to `confirmed` automatically

## Step 4: Check Payment Status

Poll the payment status endpoint:

```bash
curl https://testnet-api.fluxapay.com/api/v1/payments/pay_abc123xyz/status
```

Response:
```json
{
  "id": "pay_abc123xyz",
  "status": "confirmed",
  "amount": 10.50,
  "currency": "USDC",
  "address": "GBUQWP3BOUZX34ULNQG23RQ6F5DOBAB4NSTOF5AUFF6GPBK476QC6G5",
  "expiresAt": "2026-06-01T10:30:00Z"
}
```

## Step 5: Receive the Webhook

FluxaPay sends a webhook when the payment is confirmed. Set up a webhook endpoint in your dashboard:

```javascript
// Example webhook handler (Node.js/Express)
app.post('/webhook', (req, res) => {
  const event = req.body;
  
  if (event.event === 'payment.completed') {
    console.log('Payment completed:', event.data.payment_id);
    // Update your database, fulfill order, etc.
  }
  
  res.status(200).send();
});
```

Webhook payload:
```json
{
  "event": "payment.completed",
  "data": {
    "payment_id": "pay_abc123xyz",
    "merchant_id": "mer_xyz123",
    "amount": 10.50,
    "currency": "USDC",
    "customer_email": "customer@example.com",
    "status": "confirmed",
    "confirmed_at": "2026-06-01T10:20:00Z"
  },
  "timestamp": "2026-06-01T10:20:05Z"
}
```

## Step 6: Check Settlement

After the payment is confirmed, it will be automatically settled to your local currency. Check the settlement details:

```bash
curl https://testnet-api.fluxapay.com/api/v1/charges/pay_abc123xyz/settlement \
  -H "Authorization: Bearer fpk_test_YOUR_KEY_HERE"
```

Response:
```json
{
  "payment_id": "pay_abc123xyz",
  "settled": true,
  "settlement": {
    "id": "set_xyz789",
    "gross_usdc": 10.50,
    "fee_usdc": 0.1575,
    "net_usdc": 10.3425,
    "fx_rate": 1550.0,
    "net_fiat": 16030.88,
    "currency": "NGN",
    "payout_channel": "mock",
    "exchange_ref": "mock_exchange_123",
    "transfer_ref": "mock_transfer_456",
    "status": "completed",
    "created_at": "2026-06-01T10:20:00Z",
    "processed_date": "2026-06-01T10:20:05Z"
  }
}
```

## Next Steps

- **Production**: Get a live API key and switch to the production API
- **Webhooks**: Implement webhook signature verification for security
- **SDKs**: Use our TypeScript, Go, or Python SDKs for easier integration
- **Documentation**: See full API docs at https://docs.fluxapay.com

## Common Issues

**Payment stuck in "pending"**: Check that you sent the exact amount to the correct Stellar address on testnet.

**Webhook not received**: Ensure your webhook URL is publicly accessible and returns 200 OK.

**Settlement failed**: Verify your bank account details are correct in your merchant settings.

## Support

- Documentation: https://docs.fluxapay.com
- Email: support@fluxapay.com
- Discord: https://discord.gg/fluxapay
