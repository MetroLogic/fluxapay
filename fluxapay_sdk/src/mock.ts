import { FluxaPay, type Customer, type Payment } from './index';
import type { PaymentLink } from './batchPaymentLinks';

export interface MockRequest {
  url: URL;
  method: string;
  headers: Headers;
  body?: unknown;
}

export type MockEndpointHandler = (request: MockRequest) => unknown | Response | Promise<unknown | Response>;

export interface MockFluxaPayFixtures {
  payments: Payment[];
  paymentLinks: PaymentLink[];
  customers: Customer[];
}

export interface MockFluxaPayOptions {
  /** Overrides keyed by "METHOD /path", for example "GET /api/payments/pay_1". */
  handlers?: Record<string, MockEndpointHandler>;
  fixtures?: Partial<MockFluxaPayFixtures>;
  retries?: number;
}

let fixtureSequence = 0;
let mockClientSequence = 0;
const fixtureTimestamp = '2026-01-01T00:00:00.000Z';

export function createMockPayment(overrides: Partial<Payment> = {}): Payment {
  const id = overrides.id ?? `pay_mock_${++fixtureSequence}`;
  return {
    id,
    amount: 25,
    currency: 'USD',
    status: 'pending',
    checkout_url: `https://checkout.fluxapay.test/${id}`,
    stellar_address: 'GMOCKPAYMENTADDRESS',
    customer_email: 'buyer@example.test',
    order_id: 'order_mock_1',
    metadata: {},
    created_at: fixtureTimestamp,
    expires_at: '2026-01-01T00:30:00.000Z',
    ...overrides,
  };
}

export function createMockPaymentLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  const id = overrides.id ?? `plink_mock_${++fixtureSequence}`;
  return {
    id,
    title: 'Mock payment link',
    url: `https://checkout.fluxapay.test/link/${id}`,
    currency: 'USD',
    active: true,
    ...overrides,
  };
}

export function createMockCustomer(overrides: Partial<Customer> = {}): Customer {
  const id = overrides.id ?? `cus_mock_${++fixtureSequence}`;
  return {
    id,
    merchantId: 'merchant_mock_1',
    email: 'customer@example.test',
    name: 'Mock Customer',
    phone: null,
    stellar_address: null,
    metadata: {},
    deleted_at: null,
    created_at: fixtureTimestamp,
    updated_at: fixtureTimestamp,
    ...overrides,
  };
}

export function mockJsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has('content-type')) responseHeaders.set('content-type', 'application/json');
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: responseHeaders });
}

function notFound(path: string): Response {
  return mockJsonResponse({ code: 'NOT_FOUND', message: `No mock route for ${path}` }, 404);
}

function parseRequestBody(init?: RequestInit): unknown {
  if (typeof init?.body !== 'string') return undefined;
  try {
    return JSON.parse(init.body) as unknown;
  } catch {
    return init.body;
  }
}

/** Create a FluxaPay client backed by in-memory HTTP fixtures. */
export function createMockFluxaPayClient(options: MockFluxaPayOptions = {}): FluxaPay {
  const fixtures: MockFluxaPayFixtures = {
    payments: options.fixtures?.payments ?? [createMockPayment()],
    paymentLinks: options.fixtures?.paymentLinks ?? [createMockPaymentLink()],
    customers: options.fixtures?.customers ?? [createMockCustomer()],
  };
  const apiKey = `mock-${++mockClientSequence}`;

  const mockFetch: typeof fetch = async (input, init) => {
    const requestUrl = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const key = `${method} ${requestUrl.pathname}`;
    const mockRequest: MockRequest = {
      url: requestUrl,
      method,
      headers: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
      body: parseRequestBody(init),
    };

    const override = options.handlers?.[key];
    if (override) {
      const result = await override(mockRequest);
      if (result instanceof Error) throw result;
      return result instanceof Response ? result : mockJsonResponse(result);
    }

    const path = requestUrl.pathname;
    const body = (mockRequest.body ?? {}) as Record<string, unknown>;

    if (path === '/api/payments' && method === 'POST') {
      const payment = createMockPayment({
        amount: typeof body.amount === 'number' ? body.amount : undefined,
        currency: typeof body.currency === 'string' ? body.currency : undefined,
        customer_email: typeof body.customer_email === 'string' ? body.customer_email : undefined,
        order_id: typeof body.order_id === 'string' ? body.order_id : undefined,
      });
      fixtures.payments.push(payment);
      return mockJsonResponse(payment, 201);
    }
    if (path === '/api/payments' && method === 'GET') {
      const page = Math.max(1, Number(requestUrl.searchParams.get('page')) || 1);
      const limit = Math.max(1, Number(requestUrl.searchParams.get('limit')) || 50);
      const start = (page - 1) * limit;
      const data = fixtures.payments.slice(start, start + limit);
      return mockJsonResponse({
        data,
        meta: { page, limit, total: fixtures.payments.length, totalPages: Math.ceil(fixtures.payments.length / limit), hasNextPage: start + limit < fixtures.payments.length },
      });
    }
    const paymentMatch = path.match(/^\/api\/payments\/([^/]+)$/);
    if (paymentMatch && method === 'GET') {
      const payment = fixtures.payments.find((item) => item.id === decodeURIComponent(paymentMatch[1]));
      return payment ? mockJsonResponse(payment) : notFound(path);
    }

    if (path === '/api/v1/payment-links' && method === 'POST') {
      const link = createMockPaymentLink(body as Partial<PaymentLink>);
      fixtures.paymentLinks.push(link);
      return mockJsonResponse(link, 201);
    }
    if (path === '/api/v1/payment-links' && method === 'GET') {
      return mockJsonResponse({ data: fixtures.paymentLinks, meta: { total: fixtures.paymentLinks.length } });
    }
    const paymentLinkMatch = path.match(/^\/api\/v1\/payment-links\/([^/]+)$/);
    if (paymentLinkMatch && method === 'GET') {
      const link = fixtures.paymentLinks.find((item) => item.id === decodeURIComponent(paymentLinkMatch[1]));
      return link ? mockJsonResponse(link) : notFound(path);
    }

    if (path === '/api/v1/customers' && method === 'POST') {
      const customer = createMockCustomer({
        email: typeof body.email === 'string' ? body.email : undefined,
        name: typeof body.name === 'string' ? body.name : null,
        phone: typeof body.phone === 'string' ? body.phone : null,
        stellar_address: typeof body.stellar_address === 'string' ? body.stellar_address : null,
        metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata as Record<string, unknown> : {},
      });
      fixtures.customers.push(customer);
      return mockJsonResponse(customer, 201);
    }
    if (path === '/api/v1/customers' && method === 'GET') {
      const page = Math.max(1, Number(requestUrl.searchParams.get('page')) || 1);
      const limit = Math.max(1, Number(requestUrl.searchParams.get('limit')) || 20);
      return mockJsonResponse({ data: fixtures.customers, meta: { page, limit, total: fixtures.customers.length } });
    }
    const customerMatch = path.match(/^\/api\/v1\/customers\/([^/]+)$/);
    if (customerMatch && method === 'GET') {
      const customer = fixtures.customers.find((item) => item.id === decodeURIComponent(customerMatch[1]));
      return customer
        ? mockJsonResponse({ ...customer, payment_count: 0, total_volume: 0 })
        : notFound(path);
    }
    if (customerMatch && method === 'PATCH') {
      const customer = fixtures.customers.find((item) => item.id === decodeURIComponent(customerMatch[1]));
      if (!customer) return notFound(path);
      Object.assign(customer, body);
      customer.updated_at = new Date().toISOString();
      return mockJsonResponse(customer);
    }
    if (customerMatch && method === 'DELETE') {
      const index = fixtures.customers.findIndex((item) => item.id === decodeURIComponent(customerMatch[1]));
      if (index < 0) return notFound(path);
      fixtures.customers.splice(index, 1);
      return new Response(null, { status: 204 });
    }

    return notFound(path);
  };

  return new FluxaPay({ apiKey, baseUrl: 'https://mock.fluxapay.test', fetch: mockFetch, retries: options.retries ?? 0 });
}