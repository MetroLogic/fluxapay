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
const err = new FluxaPayError(400, 'bad request', 'VALIDATION_ERROR', null, 'req_abc123');
assert(err.statusCode === 400, 'FluxaPayError.statusCode is 400');
assert(err.message === 'bad request', 'FluxaPayError.message is set');
assert(err.code === 'VALIDATION_ERROR', 'FluxaPayError.code is set');
assert(err.requestId === 'req_abc123', 'FluxaPayError.requestId is set');
assert(err.retryable === false, '400 error is not retryable');
assert(err.is('VALIDATION_ERROR'), 'FluxaPayError.is matches code');
assert(!err.is('NOT_FOUND'), 'FluxaPayError.is rejects other codes');
assert(err.name === 'FluxaPayError', 'FluxaPayError.name is correct');

const err429 = new FluxaPayError(429, 'rate limited', 'RATE_LIMITED', null, 'req_429');
assert(err429.retryable === true, '429 error is retryable');

const err500 = new FluxaPayError(500, 'server error', 'INTERNAL_ERROR', null, 'req_500');
assert(err500.retryable === false, '500 error is not retryable');

const err503 = new FluxaPayError(503, 'service unavailable', 'UNAVAILABLE', null, 'req_503');
assert(err503.retryable === true, '503 error is retryable');

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
