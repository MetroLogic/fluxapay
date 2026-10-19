/**
 * SDK unit tests – pure Node.js, no test framework needed.
 * Run with: node --experimental-vm-modules src/__tests__/sdk.test.ts
 * (or wire into jest / vitest)
 */
import {
  createMockCustomer,
  createMockFluxaPayClient,
  createMockPayment,
  createMockPaymentLink,
  FluxaPay,
  FluxaPayError,
  mockJsonResponse,
} from '../index';

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
    const retryingClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001', retries: 2, timeoutMs: 0 });
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
    const retryingClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001', retries: 1, timeoutMs: 0 });
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
    const retryingClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001', retries: 1, timeoutMs: 0 });
    await retryingClient.payments.get('pay_3');
    assert(delays.length === 1 && delays[0] === 2000, 'honors Retry-After on 429 responses');
  });

  let clientErrorAttempts = 0;
  await withMockedNetwork(async () => {
    clientErrorAttempts++;
    return jsonResponse({ message: 'invalid request' }, 400);
  }, async (delays) => {
    const retryingClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3001', retries: 3, timeoutMs: 0 });
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

async function runPagingTests(): Promise<void> {
  const calls: string[] = [];
  await withMockedNetwork(async (input) => {
    const url = new URL(String(input));
    calls.push(url.href);
    const page = Number(url.searchParams.get('page'));
    return jsonResponse(page === 1
      ? { data: [{ id: 'pay_1' }, { id: 'pay_2' }], meta: { page: 1, totalPages: 2, hasNextPage: true } }
      : { data: [{ id: 'pay_3' }], meta: { page: 2, totalPages: 2, hasNextPage: false } });
  }, async () => {
    const client = new FluxaPay({ apiKey: 'sk_paging_test', baseUrl: 'http://localhost:3001' });
    const seen: string[] = [];
    for await (const payment of client.payments.list({ limit: 2 })) seen.push(payment.id);
    assert(seen.join(',') === 'pay_1,pay_2,pay_3', 'for-await iterates through all payment pages');
    assert(calls.length === 2 && calls.every((url) => new URL(url).searchParams.get('limit') === '2'), 'requests subsequent pages with the configured limit');

    const callbackIds: string[] = [];
    await client.payments.list({ limit: 2 }).autoPagingEach(async (payment) => {
      callbackIds.push(payment.id);
    });
    assert(callbackIds.join(',') === 'pay_1,pay_2,pay_3', 'autoPagingEach awaits callbacks for every payment');
  });

  let attempts = 0;
  await withMockedNetwork(async (input) => {
    const url = new URL(String(input));
    attempts++;
    if (attempts === 1) return jsonResponse({ message: 'rate limited' }, 429, { 'Retry-After': '1' });
    if (url.searchParams.get('cursor') === 'cursor_2') {
      return jsonResponse({ payments: [{ id: 'pay_2' }], has_more: false });
    }
    return jsonResponse({ payments: [{ id: 'pay_1' }], has_more: true, next_cursor: 'cursor_2' });
  }, async (delays) => {
    const client = new FluxaPay({ apiKey: 'sk_cursor_test', baseUrl: 'http://localhost:3001', retries: 1, timeoutMs: 0 });
    const ids: string[] = [];
    for await (const payment of client.payments.list({ limit: 1 })) ids.push(payment.id);
    assert(ids.join(',') === 'pay_1,pay_2', 'follows next_cursor until the final page');
    assert(attempts === 3 && delays.length === 1 && delays[0] === 1000, 'backs off and retries rate-limited page requests');
  });
}

async function runMockClientTests(): Promise<void> {
  const mockPayment = createMockPayment({ id: 'pay_fixture_1', amount: 42 });
  const mockCustomer = createMockCustomer({ id: 'cus_fixture_1', email: 'fixture@example.test' });
  const mockLink = createMockPaymentLink({ id: 'plink_fixture_1', title: 'Fixture link' });
  const client = createMockFluxaPayClient({
    fixtures: { payments: [mockPayment], customers: [mockCustomer], paymentLinks: [mockLink] },
    handlers: {
      'GET /api/payments/pay_override': () => mockJsonResponse({ ...mockPayment, id: 'pay_override' }),
      'GET /api/payments/pay_network_error': () => { throw new TypeError('mock network failure'); },
    },
  });

  const createdPayment = await client.payments.create({ amount: 99, currency: 'USD', customer_email: 'buyer@example.test' });
  assert(createdPayment.amount === 99, 'mock client returns generated payment fixture data');
  assert((await client.payments.get(createdPayment.id)).id === createdPayment.id, 'mock client retains created payments for retrieval');
  const paymentPage = await client.payments.list({ limit: 10 });
  assert(paymentPage.data?.[0].id === 'pay_fixture_1', 'mock client serves configured payment fixtures');
  const paymentLink = await client.paymentLinks.create({ title: 'Mock link', currency: 'USD' });
  assert(paymentLink.id.startsWith('plink_mock_'), 'mock client handles payment link creation');
  const customerList = await client.customers.list();
  assert(customerList.data[0].email === 'fixture@example.test', 'mock client serves configured customer fixtures');
  const createdCustomer = await client.customers.create({ email: 'created@example.test' });
  assert((await client.customers.get(createdCustomer.id)).email === 'created@example.test', 'mock client retains created customers for retrieval');
  const overriddenPayment = await client.payments.get('pay_override');
  assert(overriddenPayment.id === 'pay_override', 'mock client allows endpoint response overrides');

  let networkError: unknown;
  try {
    await client.payments.get('pay_network_error');
  } catch (error) {
    networkError = error;
  }
  assert(networkError instanceof TypeError && networkError.message === 'mock network failure', 'mock handlers can simulate network errors');
}

async function runCreatePaymentTest(): Promise<void> {
  globalThis.fetch = async (_input, init) => {
    createPaymentRequestBody = init?.body;
    return jsonResponse({ id: 'pay_1' });
  };
  try {
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
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runAllTests(): Promise<void> {
  await runCreatePaymentTest();
  await runRetryTests();
  await runResourceTests();
  await runPagingTests();
  await runMockClientTests();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

runAllTests().catch((error: unknown) => {
  console.error('SDK retry tests failed:', error);
  process.exitCode = 1;
});
