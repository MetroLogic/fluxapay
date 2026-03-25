/**
 * SDK Integration Tests
 * 
 * Tests the SDK against a running local backend instance.
 * 
 * Prerequisites:
 * 1. Backend must be running on http://localhost:3001
 * 2. Test merchant account must exist with valid API key
 * 
 * Run with: npm test -- integration.test.ts
 * Or: node --experimental-vm-modules src/__tests__/integration.test.ts
 */

import { FluxaPay, FluxaPayError } from '../index';

// ── Configuration ────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_API_KEY = process.env.TEST_API_KEY || 'test_api_key_placeholder';

// Skip integration tests if no API key is provided
const SKIP_INTEGRATION = !process.env.TEST_API_KEY;

if (SKIP_INTEGRATION) {
  console.log('\n⚠️  Skipping integration tests (no TEST_API_KEY provided)\n');
  console.log('To run integration tests:');
  console.log('  1. Start the backend: cd fluxapay_backend && npm run dev');
  console.log('  2. Set TEST_API_KEY: export TEST_API_KEY=your_test_key');
  console.log('  3. Run tests: npm test\n');
  process.exit(0);
}

// ── Test Helpers ─────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    pass++;
  } else {
    console.error(`  ✗  ${label}`);
    fail++;
  }
}

async function assertAsync(fn: () => Promise<boolean>, label: string) {
  try {
    const result = await fn();
    assert(result, label);
  } catch (error) {
    console.error(`  ✗  ${label}`);
    console.error(`     Error: ${error instanceof Error ? error.message : String(error)}`);
    fail++;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\n🧪 FluxaPay SDK – Integration Tests\n');
console.log(`Backend URL: ${BACKEND_URL}`);
console.log(`API Key: ${TEST_API_KEY.substring(0, 10)}...\n`);

const client = new FluxaPay({
  apiKey: TEST_API_KEY,
  baseUrl: BACKEND_URL,
});

(async () => {
  // ── Health Check ───────────────────────────────────────────────────────────

  console.log('Health Check:');
  try {
    const healthRes = await fetch(`${BACKEND_URL}/health`);
    const health = await healthRes.json();
    assert(health.status === 'ok', 'Backend is healthy');
  } catch (error) {
    console.error(`  ✗  Backend health check failed: ${error}`);
    console.error('     Make sure the backend is running on', BACKEND_URL);
    process.exit(1);
  }

  // ── Merchant Profile ───────────────────────────────────────────────────────

  console.log('\nMerchant Profile:');
  await assertAsync(async () => {
    const profile = await client.merchant.getProfile();
    return profile !== null && typeof profile === 'object';
  }, 'GET /api/merchants/me returns profile');

  // ── Payments ───────────────────────────────────────────────────────────────

  console.log('\nPayments:');
  
  let createdPaymentId: string | null = null;

  await assertAsync(async () => {
    const payment = await client.payments.create({
      amount: 100.50,
      currency: 'USD',
      customer_email: 'test@example.com',
      order_id: `test_order_${Date.now()}`,
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      expires_in_minutes: 30,
    });
    
    createdPaymentId = payment.id;
    
    return (
      payment.id !== undefined &&
      payment.amount === 100.50 &&
      payment.currency === 'USD' &&
      payment.status === 'pending' &&
      payment.checkout_url !== undefined
    );
  }, 'POST /api/payments creates payment');

  if (createdPaymentId) {
    await assertAsync(async () => {
      const payment = await client.payments.get(createdPaymentId!);
      return payment.id === createdPaymentId && payment.status !== undefined;
    }, 'GET /api/payments/:id retrieves payment');

    await assertAsync(async () => {
      const status = await client.payments.getStatus(createdPaymentId!);
      return status.id === createdPaymentId && status.status !== undefined;
    }, 'GET /api/payments/:id (status) retrieves payment status');
  }

  await assertAsync(async () => {
    const result = await client.payments.list({ page: 1, limit: 10 });
    return (
      Array.isArray(result.payments) &&
      typeof result.total === 'number'
    );
  }, 'GET /api/payments lists payments');

  // ── Settlements ────────────────────────────────────────────────────────────

  console.log('\nSettlements:');

  await assertAsync(async () => {
    const result = await client.settlements.list({ page: 1, limit: 10 });
    return (
      Array.isArray(result.settlements) &&
      typeof result.total === 'number'
    );
  }, 'GET /api/settlements lists settlements');

  await assertAsync(async () => {
    const summary = await client.settlements.summary();
    return summary !== null && typeof summary === 'object';
  }, 'GET /api/settlements/summary returns summary');

  // ── Error Handling ─────────────────────────────────────────────────────────

  console.log('\nError Handling:');

  await assertAsync(async () => {
    try {
      await client.payments.get('invalid_payment_id');
      return false; // Should have thrown
    } catch (error) {
      return (
        error instanceof FluxaPayError &&
        (error.statusCode === 404 || error.statusCode === 400)
      );
    }
  }, 'Invalid payment ID throws FluxaPayError');

  // ── Webhook Verification ───────────────────────────────────────────────────

  console.log('\nWebhook Verification:');

  const webhookSecret = 'test_webhook_secret';
  const webhookPayload = JSON.stringify({
    event: 'payment.completed',
    payment_id: 'pay_test_123',
    merchant_id: 'merch_test',
    timestamp: new Date().toISOString(),
    data: { amount: 100, currency: 'USD' },
  });

  const crypto = await import('crypto');
  const timestamp = new Date().toISOString();
  const validSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${webhookPayload}`)
    .digest('hex');

  assert(
    client.webhooks.verify(webhookPayload, validSignature, webhookSecret, timestamp),
    'Valid webhook signature passes verification'
  );

  assert(
    !client.webhooks.verify(webhookPayload, 'invalid_signature', webhookSecret, timestamp),
    'Invalid webhook signature fails verification'
  );

  const parsedEvent = client.webhooks.parse(webhookPayload);
  assert(
    parsedEvent.event === 'payment.completed' && parsedEvent.payment_id === 'pay_test_123',
    'Webhook payload parses correctly'
  );

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(50) + '\n');

  if (fail > 0) {
    console.error('❌ Some tests failed\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed\n');
    process.exit(0);
  }
})();
