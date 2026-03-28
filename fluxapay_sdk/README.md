# FluxaPay SDK

Official JavaScript/TypeScript SDK for FluxaPay payment integration.

## Installation

```bash
npm install @fluxapay/sdk
```

## Quick Start

```typescript
import { FluxaPay } from '@fluxapay/sdk';

const client = new FluxaPay({
  apiKey: 'sk_live_your_api_key',
  // baseUrl: 'https://api.fluxapay.com' // Optional, defaults to production
});

// Create a payment
const payment = await client.payments.create({
  amount: 99.99,
  currency: 'USD',
  customer_email: 'customer@example.com',
  order_id: 'order_123',
  success_url: 'https://yoursite.com/success',
  cancel_url: 'https://yoursite.com/cancel',
});

console.log('Payment URL:', payment.checkout_url);
```

## API Reference

### Configuration

```typescript
const client = new FluxaPay({
  apiKey: string;      // Required: Your FluxaPay API key
  baseUrl?: string;    // Optional: API base URL (defaults to production)
});
```

### Payments

#### Create Payment

```typescript
const payment = await client.payments.create({
  amount: number;                  // Required: Amount in specified currency
  currency: string;                // Required: ISO 4217 currency code (e.g., 'USD', 'NGN')
  customer_email: string;          // Required: Customer email
  order_id?: string;               // Optional: Your internal order ID
  success_url?: string;            // Optional: Redirect URL after success
  cancel_url?: string;             // Optional: Redirect URL after cancellation
  metadata?: Record<string, any>;  // Optional: Custom metadata
  expires_in_minutes?: number;     // Optional: Expiration time (default: 30)
});
```

**Canonical Route:** `POST /api/payments`

#### Get Payment

```typescript
const payment = await client.payments.get(paymentId);
```

**Canonical Route:** `GET /api/payments/:payment_id`

#### Get Payment Status

```typescript
const status = await client.payments.getStatus(paymentId);
```

**Canonical Route:** `GET /api/payments/:payment_id`

#### List Payments

```typescript
const result = await client.payments.list({
  page?: number;      // Optional: Page number (default: 1)
  limit?: number;     // Optional: Items per page (default: 10)
  status?: string;    // Optional: Filter by status
});
```

**Canonical Route:** `GET /api/payments`

### Settlements

#### List Settlements

```typescript
const result = await client.settlements.list({
  page?: number;
  limit?: number;
  status?: string;
  currency?: string;
  date_from?: string;  // ISO 8601 date
  date_to?: string;    // ISO 8601 date
});
```

**Canonical Route:** `GET /api/settlements`

#### Get Settlement Summary

```typescript
const summary = await client.settlements.summary();
```

**Canonical Route:** `GET /api/settlements/summary`

#### Get Settlement

```typescript
const settlement = await client.settlements.get(settlementId);
```

**Canonical Route:** `GET /api/settlements/:settlement_id`

#### Export Settlement

```typescript
const blob = await client.settlements.export(settlementId, 'pdf'); // or 'csv'
```

**Canonical Route:** `GET /api/settlements/:settlement_id/export`

### Merchant

#### Get Profile

```typescript
const profile = await client.merchant.getProfile();
```

**Canonical Route:** `GET /api/merchants/me`

#### Update Profile

```typescript
await client.merchant.updateProfile({
  business_name?: string;
  email?: string;
  settlement_schedule?: 'daily' | 'weekly';
  settlement_day?: number;
});
```

**Canonical Route:** `PATCH /api/merchants/me`

#### Update Webhook URL

```typescript
await client.merchant.updateWebhook('https://yoursite.com/webhook');
```

**Canonical Route:** `PATCH /api/merchants/me/webhook`

#### Update Settlement Schedule

```typescript
await client.merchant.updateSettlementSchedule({
  settlement_schedule: 'weekly',
  settlement_day: 5, // Friday
});
```

**Canonical Route:** `PATCH /api/merchants/me/settlement-schedule`

#### Add Bank Account

```typescript
await client.merchant.addBankAccount({
  account_number: '1234567890',
  bank_name: 'Example Bank',
  bank_code: 'EXB',
  account_name: 'Business Name',
});
```

**Canonical Route:** `POST /api/merchants/me/bank-account`

### Webhooks

#### Verify Webhook Signature

```typescript
const isValid = client.webhooks.verify(
  rawBody,           // Raw request body as string
  signature,         // X-FluxaPay-Signature header
  webhookSecret,     // Your webhook secret
  timestamp          // X-FluxaPay-Timestamp header (optional)
);

if (!isValid) {
  throw new Error('Invalid webhook signature');
}
```

#### Parse Webhook Event

```typescript
const event = client.webhooks.parse(rawBody);

console.log(event.event);        // e.g., 'payment.completed'
console.log(event.payment_id);   // Payment ID
console.log(event.data);         // Event data
```

## Error Handling

The SDK throws `FluxaPayError` for API errors:

```typescript
import { FluxaPayError } from '@fluxapay/sdk';

try {
  const payment = await client.payments.get('invalid_id');
} catch (error) {
  if (error instanceof FluxaPayError) {
    console.error('Status:', error.statusCode);
    console.error('Message:', error.message);
    console.error('Raw:', error.raw);
  }
}
```

## Canonical API Routes

All SDK methods use the canonical `/api/*` routes:

| Resource | Method | Route |
|----------|--------|-------|
| Payments | POST | `/api/payments` |
| Payments | GET | `/api/payments/:id` |
| Payments | GET | `/api/payments` |
| Settlements | GET | `/api/settlements` |
| Settlements | GET | `/api/settlements/summary` |
| Settlements | GET | `/api/settlements/:id` |
| Settlements | GET | `/api/settlements/:id/export` |
| Merchant | GET | `/api/merchants/me` |
| Merchant | PATCH | `/api/merchants/me` |
| Merchant | PATCH | `/api/merchants/me/webhook` |
| Merchant | PATCH | `/api/merchants/me/settlement-schedule` |
| Merchant | POST | `/api/merchants/me/bank-account` |

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

## Usage Examples

Additional runnable examples are available in:

- `examples/basic-usage.ts`
- `examples/webhook-verification.ts`

## Publishing and Versioning

The SDK follows semantic versioning (`MAJOR.MINOR.PATCH`) and publishes from git tags.

Release flow:

1. Bump `version` in `package.json`.
2. Commit and push to main.
3. Create and push a matching tag in this format:

```bash
git tag sdk-v0.1.0
git push origin sdk-v0.1.0
```

The GitHub workflow `.github/workflows/sdk-release.yml` validates tag/package version parity, runs tests/build, and publishes `@fluxapay/sdk` to npm.

Integration tests require a running backend instance:

```bash
# 1. Start the backend
cd fluxapay_backend && npm run dev

# 2. Set your test API key
export TEST_API_KEY=your_test_api_key

# 3. Run integration tests
cd fluxapay_sdk
npm test -- integration.test.ts
```

## Development

```bash
# Build the SDK
npm run build

# Run tests
npm test

# Publish (requires build first)
npm publish
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions.

```typescript
import { FluxaPay, Payment, PaymentStatus, FluxaPayError } from '@fluxapay/sdk';
```

## License

ISC

## Support

For issues and questions:
- GitHub: https://github.com/fluxapay/fluxapay
- Email: support@fluxapay.com
- Docs: https://docs.fluxapay.com
