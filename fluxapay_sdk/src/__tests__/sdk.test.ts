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

  const paymentParams = { amount: 10, currency: 'USDC', customer_email: 'buyer@example.com' };
  const baseUrl = 'http://localhost:3001';

  // Default maxRetries is 2 → 3 attempts in total.
  let defaultAttempts = 0;
  await withMockedNetwork(async () => {
    defaultAttempts++;
    return jsonResponse({ message: 'unavailable' }, 503);
  }, async (delays) => {
    const defaultClient = new FluxaPay({ apiKey: 'sk_test_123', baseUrl });
    let thrown: unknown;
    try {
      await defaultClient.payments.get('pay_default');
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof FluxaPayError && thrown.statusCode === 503, 'throws the last retryable error');
    assert(defaultAttempts === 3 && delays.length === 2, 'retries twice by default (maxRetries = 2)');
  });

  // maxRetries takes precedence over the deprecated retries option.
  let maxRetriesAttempts = 0;
  await withMockedNetwork(async () => {
    maxRetriesAttempts++;
    return jsonResponse({ message: 'bad gateway' }, 502);
  }, async () => {
    const configured = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 4, retries: 1 });
    await configured.payments.get('pay_max').catch(() => undefined);
    assert(maxRetriesAttempts === 5, 'maxRetries overrides retries');
  });

  // Each retryable status is retried; 500 is not.
  for (const status of [429, 502, 503, 504]) {
    let statusAttempts = 0;
    await withMockedNetwork(async () => {
      statusAttempts++;
      return statusAttempts === 1 ? jsonResponse({ message: 'retry me' }, status) : jsonResponse({ id: 'pay_s' });
    }, async () => {
      const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 1 });
      await c.payments.get('pay_s');
      assert(statusAttempts === 2, `retries HTTP ${status}`);
    });
  }

  let serverErrorAttempts = 0;
  await withMockedNetwork(async () => {
    serverErrorAttempts++;
    return jsonResponse({ message: 'boom' }, 500);
  }, async () => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 3 });
    await c.payments.get('pay_500').catch(() => undefined);
    assert(serverErrorAttempts === 1, 'does not retry HTTP 500');
  });

  // POST without an idempotency key is never retried.
  let unsafePostAttempts = 0;
  await withMockedNetwork(async () => {
    unsafePostAttempts++;
    return jsonResponse({ message: 'unavailable' }, 503);
  }, async (delays) => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 3 });
    let thrown: unknown;
    try {
      await c.payments.create(paymentParams);
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof FluxaPayError && thrown.statusCode === 503, 'surfaces POST failure without idempotency key');
    assert(unsafePostAttempts === 1 && delays.length === 0, 'does not retry POST without an idempotency key');
  });

  // POST with an idempotency key is retried and sends the header on every attempt.
  const idempotencyHeaders: Array<string | null> = [];
  await withMockedNetwork(async (_input, init) => {
    idempotencyHeaders.push(new Headers(init?.headers).get('Idempotency-Key'));
    return idempotencyHeaders.length === 1
      ? jsonResponse({ message: 'unavailable' }, 503)
      : jsonResponse({ id: 'pay_idem' }, 201);
  }, async () => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 2 });
    const payment = await c.payments.create(paymentParams, { idempotencyKey: 'order_42' });
    assert(payment.id === 'pay_idem', 'retries POST with an idempotency key');
    assert(
      idempotencyHeaders.length === 2 && idempotencyHeaders.every((h) => h === 'order_42'),
      'sends Idempotency-Key on every attempt',
    );
  });

  // Refund idempotency_key is forwarded as the header.
  let refundHeader = null as string | null;
  let refundAttempts = 0;
  await withMockedNetwork(async (_input, init) => {
    refundAttempts++;
    refundHeader = new Headers(init?.headers).get('Idempotency-Key');
    return refundAttempts === 1 ? jsonResponse({ message: 'rate limited' }, 429) : jsonResponse({ id: 'ref_1' }, 201);
  }, async () => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 1 });
    await c.refunds.create({ payment_id: 'pay_1', amount: 5, idempotency_key: 'refund_7' });
    assert(refundHeader === 'refund_7' && refundAttempts === 2, 'retries refunds that carry idempotency_key');
  });

  // Retry-After longer than retryMaxDelayMs is not waited on.
  let longRetryAfterAttempts = 0;
  await withMockedNetwork(async () => {
    longRetryAfterAttempts++;
    return jsonResponse({ message: 'slow down' }, 429, { 'Retry-After': '120' });
  }, async (delays) => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 3, retryMaxDelayMs: 10_000 });
    let thrown: unknown;
    try {
      await c.payments.get('pay_slow');
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof FluxaPayError && thrown.statusCode === 429, 'surfaces 429 when Retry-After exceeds the cap');
    assert(longRetryAfterAttempts === 1 && delays.length === 0, 'does not wait longer than retryMaxDelayMs');
  });

  // Retry-After as an HTTP date.
  let dateAttempts = 0;
  await withMockedNetwork(async () => {
    dateAttempts++;
    return dateAttempts === 1
      ? jsonResponse({ message: 'slow down' }, 429, { 'Retry-After': new Date(Date.now() + 5_000).toUTCString() })
      : jsonResponse({ id: 'pay_date' });
  }, async (delays) => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 1 });
    await c.payments.get('pay_date');
    assert(delays.length === 1 && delays[0] > 3_000 && delays[0] <= 5_000, 'honors Retry-After HTTP dates');
  });

  // Configurable backoff base delay (Math.random is pinned to 0.5).
  await withMockedNetwork(async () => jsonResponse({ message: 'unavailable' }, 503), async (delays) => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 3, retryInitialDelayMs: 1_000, retryMaxDelayMs: 3_000 });
    await c.payments.get('pay_backoff').catch(() => undefined);
    assert(
      delays.length === 3 && delays[0] === 500 && delays[1] === 1_000 && delays[2] === 1_500,
      'applies configurable exponential backoff with jitter and cap',
    );
  });

  // Timeouts: each attempt gets an AbortSignal; timeouts are retried then surfaced as 408.
  const signals: Array<AbortSignal | null | undefined> = [];
  await withMockedNetwork(async (_input, init) => {
    signals.push(init?.signal);
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  }, async (delays) => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, maxRetries: 1, timeout: 5_000 });
    let thrown: unknown;
    try {
      await c.payments.get('pay_timeout');
    } catch (error) {
      thrown = error;
    }
    assert(signals.length === 2 && signals.every((sig) => sig instanceof AbortSignal), 'attaches a timeout signal to every attempt');
    assert(delays.length === 1, 'retries timed-out idempotent requests');
    assert(
      thrown instanceof FluxaPayError && thrown.statusCode === 408 && thrown.code === 'REQUEST_TIMEOUT',
      'throws FluxaPayError REQUEST_TIMEOUT after the last timeout',
    );
  });

  let noTimeoutSignal = null as AbortSignal | null | undefined;
  await withMockedNetwork(async (_input, init) => {
    noTimeoutSignal = init?.signal;
    return jsonResponse({ id: 'pay_nt' });
  }, async () => {
    const c = new FluxaPay({ apiKey: 'sk_test_123', baseUrl, timeout: 0 });
    await c.payments.get('pay_nt');
    assert(noTimeoutSignal === undefined, 'timeout: 0 disables the request timeout');
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
