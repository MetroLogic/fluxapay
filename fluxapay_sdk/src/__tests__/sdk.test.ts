/**
 * SDK unit tests – pure Node.js, no test framework needed.
 * Run with: node --experimental-vm-modules src/__tests__/sdk.test.ts
 * (or wire into jest / vitest)
 */
import { FluxaPay, FluxaPayError } from '../index';

// ── Simple assertion helper ──────────────────────────────────────────────────
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

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\nFluxaPay SDK – unit tests\n');

// Constructor validation
try {
  new FluxaPay({ apiKey: '' });
  assert(false, 'should throw when apiKey is empty');
} catch (e) {
  assert((e as Error).message.includes('apiKey'), 'throws when apiKey is empty');
}

const client = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001' });
assert(client instanceof FluxaPay, 'creates client instance');

// FluxaPayError
const err = new FluxaPayError(400, 'bad request');
assert(err.statusCode === 400, 'FluxaPayError.statusCode is 400');
assert(err.message === 'bad request', 'FluxaPayError.message is set');
assert(err.name === 'FluxaPayError', 'FluxaPayError.name is correct');

// Webhook verify – tampered payload should fail
const secret = 'webhook_secret_test';
const rawBody = JSON.stringify({ event: 'payment_completed', payment_id: 'pay_1' });
import crypto from 'crypto';
const timestamp = new Date().toISOString();
const validSig = crypto
  .createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');
assert(
  client.webhooks.verify(rawBody, validSig, secret, timestamp),
  'valid webhook signature passes'
);
assert(
  !client.webhooks.verify(rawBody, 'bad_signature', secret, timestamp),
  'invalid signature fails'
);

// Parse webhook
const event = client.webhooks.parse(rawBody);
assert(event.event === 'payment_completed', 'webhook.parse returns correct event');
assert(event.payment_id === 'pay_1', 'webhook.parse returns correct payment_id');

// Summary
console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
