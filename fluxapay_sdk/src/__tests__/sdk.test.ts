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

const originalFetch = globalThis.fetch;
let createPaymentRequestBody: unknown;
globalThis.fetch = async (_input, init) => {
  createPaymentRequestBody = init?.body;
  return {
    ok: true,
    json: async () => ({ id: 'pay_1' }),
    headers: new Headers(),
  } as Response;
};
await client.payments.create({
  amount: 10,
  currency: 'USD',
  customer_email: 'buyer@example.com',
  expires_in_seconds: 1800,
});
assert(
  JSON.parse(createPaymentRequestBody as string).expires_in_seconds === 1800,
  'sends expires_in_seconds when creating a payment',
);
globalThis.fetch = originalFetch;

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

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

async function withMockedNetwork(
  mockFetch: typeof fetch,
  run: (delays: number[]) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalRandom = Math.random;
  const delays: number[] = [];

  globalThis.fetch = mockFetch;
  globalThis.setTimeout = ((callback: () => void, delay = 0) => {
    delays.push(delay);
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof globalThis.setTimeout;
  Math.random = () => 0.5;

  try {
    await run(delays);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    Math.random = originalRandom;
  }
}

async function runRetryTests(): Promise<void> {
  let attempts = 0;
  await withMockedNetwork(async () => {
    attempts++;
    return jsonResponse(attempts < 3 ? { message: 'busy' } : { id: 'pay_1' }, attempts < 3 ? 503 : 200);
  }, async (delays) => {
    const retryingClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001', retries: 2 });
    const payment = await retryingClient.payments.get('pay_1');
    assert(payment.id === 'pay_1', 'retries transient 503 responses and returns success');
    assert(attempts === 3, 'performs no more than the configured number of retries');
    assert(delays.length === 2 && delays[0] === 50 && delays[1] === 100, 'uses jittered exponential backoff');
  });

  attempts = 0;
  await withMockedNetwork(async () => {
    attempts++;
    if (attempts === 1) throw new TypeError('network dropped');
    return jsonResponse({ id: 'pay_2' });
  }, async (delays) => {
    const retryingClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001', retries: 1 });
    const payment = await retryingClient.payments.get('pay_2');
    assert(payment.id === 'pay_2' && attempts === 2, 'retries network failures');
    assert(delays.length === 1, 'backs off after a network failure');
  });

  let rateLimitAttempts = 0;
  await withMockedNetwork(async () => {
    rateLimitAttempts++;
    return rateLimitAttempts === 1
      ? jsonResponse({ message: 'rate limited' }, 429, { 'Retry-After': '2' })
      : jsonResponse({ id: 'pay_3' });
  }, async (delays) => {
    const retryingClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001', retries: 1 });
    await retryingClient.payments.get('pay_3');
    assert(delays.length === 1 && delays[0] === 2000, 'honors Retry-After on 429 responses');
  });

  let clientErrorAttempts = 0;
  await withMockedNetwork(async () => {
    clientErrorAttempts++;
    return jsonResponse({ message: 'invalid request' }, 400);
  }, async (delays) => {
    const retryingClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001', retries: 3 });
    let thrown: unknown;
    try {
      await retryingClient.payments.get('pay_4');
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof FluxaPayError && thrown.statusCode === 400, 'returns non-retryable 4xx errors');
    assert(clientErrorAttempts === 1 && delays.length === 0, 'does not retry non-retryable 4xx responses');
  });

}

async function runResourceTests(): Promise<void> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  await withMockedNetwork(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    return init?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : jsonResponse({});
  }, async () => {
    const client = new FluxaPay({ apiKey: 'sk_resource_test', baseUrl: 'http://localhost:3001' });
    await client.customers.create({ email: 'buyer@example.com', name: 'Buyer' });
    await client.customers.get('cus/123');
    await client.customers.list({
      page: 2,
      limit: 15,
      search: 'buyer@example.com',
      created_after: '2026-01-01T00:00:00.000Z',
      created_before: '2026-12-31T23:59:59.000Z',
    });
    await client.customers.update('cus/123', { phone: '+15555550123' });
    await client.customers.delete('cus/123');
    await client.refunds.create({ payment_id: 'pay_123', amount: 25, reason: 'Duplicate' });
    await client.refunds.get('ref_123');
    await client.refunds.list({ page: 3, limit: 5, status: 'completed', payment_id: 'pay_123' });

    const expected = [
      ['POST', 'http://localhost:3001/api/v1/customers'],
      ['GET', 'http://localhost:3001/api/v1/customers/cus%2F123'],
      ['GET', 'http://localhost:3001/api/v1/customers?page=2&limit=15&search=buyer%40example.com&created_after=2026-01-01T00%3A00%3A00.000Z&created_before=2026-12-31T23%3A59%3A59.000Z'],
      ['PATCH', 'http://localhost:3001/api/v1/customers/cus%2F123'],
      ['DELETE', 'http://localhost:3001/api/v1/customers/cus%2F123'],
      ['POST', 'http://localhost:3001/api/v1/refunds'],
      ['GET', 'http://localhost:3001/api/v1/refunds/ref_123'],
      ['GET', 'http://localhost:3001/api/v1/refunds?page=3&limit=5&status=completed&payment_id=pay_123'],
    ];
    assert(calls.length === expected.length, 'calls every customer and refund resource endpoint');
    for (const [index, [method, url]] of expected.entries()) {
      assert(calls[index].init?.method === method && calls[index].url === url, `uses ${method} ${url}`);
      const headers = new Headers(calls[index].init?.headers);
      assert(
        headers.get('Authorization') === 'Bearer sk_resource_test' &&
          headers.get('X-API-Version') === 'v1' &&
          headers.get('Content-Type') === 'application/json',
        `sends standard auth and version headers for ${method} ${url}`,
      );
    }
    assert(calls[0].init?.body === JSON.stringify({ email: 'buyer@example.com', name: 'Buyer' }), 'sends customer create payload');
    assert(calls[3].init?.body === JSON.stringify({ phone: '+15555550123' }), 'sends customer update payload');
    assert(calls[5].init?.body === JSON.stringify({ payment_id: 'pay_123', amount: 25, reason: 'Duplicate' }), 'sends refund create payload');
  });
}

async function runAllTests(): Promise<void> {
  await runRetryTests();
  await runResourceTests();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

runAllTests().catch((error: unknown) => {
  console.error('SDK retry tests failed:', error);
  process.exitCode = 1;
});
