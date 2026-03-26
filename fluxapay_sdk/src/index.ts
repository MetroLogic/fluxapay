// ── Types ────────────────────────────────────────────────────────────────────

export interface FluxaPayConfig {
  /** Your secret API key (keep server-side). */
  apiKey: string;
  /**
   * Base URL of the FluxaPay backend.
   * Defaults to the hosted production URL.
   */
  baseUrl?: string;
}

export interface CreatePaymentParams {
  /** Amount in the specified currency (e.g. 99.99). */
  amount: number;
  /** ISO 4217 currency code the customer sees (e.g. "USD", "NGN"). */
  currency: string;
  /** Customer email for receipt / tracking. */
  customer_email: string;
  /** Your internal order / reference ID. */
  order_id?: string;
  /** URL to redirect to after successful payment. */
  success_url?: string;
  /** URL to redirect to after payment expiry / failure. */
  cancel_url?: string;
  /** Arbitrary metadata attached to the payment. */
  metadata?: Record<string, unknown>;
  /** Minutes until payment link expires. Default: 30. */
  expires_in_minutes?: number;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'failed' | 'expired';
  checkout_url: string;
  stellar_address: string;
  customer_email: string;
  order_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  expires_at: string;
}

export interface PaymentStatus {
  id: string;
  status: Payment['status'];
  transaction_hash?: string;
  confirmed_at?: string;
}

export interface WebhookEvent {
  event: string;
  payment_id: string;
  merchant_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class FluxaPayError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'FluxaPayError';
  }
}

// ── Client ───────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.fluxapay.com';
const API_VERSION = 'v1';

async function request<T>(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-API-Version': API_VERSION,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new FluxaPayError(
      res.status,
      (json as { message?: string })?.message ?? `HTTP ${res.status}`,
      json,
    );
  }

  return json as T;
}

/**
 * FluxaPay SDK client.
 *
 * @example
 * ```ts
 * import { FluxaPay } from '@fluxapay/sdk';
 *
 * const client = new FluxaPay({ apiKey: 'sk_live_...' });
 *
 * const payment = await client.payments.create({
 *   amount: 49.99,
 *   currency: 'USD',
 *   customer_email: 'buyer@example.com',
 *   order_id: 'order_123',
 * });
 *
 * console.log(payment.checkout_url);
 * ```
 */
export class FluxaPay {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: FluxaPayConfig) {
    if (!config.apiKey) throw new Error('FluxaPay: apiKey is required');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  // ── payments ───────────────────────────────────────────────────────────────

  readonly payments = {
    /**
     * Create a new payment link.
     * Returns a `checkout_url` your customer should be redirected to.
     * 
     * Canonical route: POST /api/payments
     */
    create: (params: CreatePaymentParams): Promise<Payment> =>
      request<Payment>(this.baseUrl, this.apiKey, 'POST', '/api/payments', params),

    /**
     * Retrieve a payment by its ID.
     * 
     * Canonical route: GET /api/payments/:payment_id
     */
    get: (paymentId: string): Promise<Payment> =>
      request<Payment>(this.baseUrl, this.apiKey, 'GET', `/api/payments/${paymentId}`),

    /**
     * Poll the current status of a payment.
     * 
     * Canonical route: GET /api/payments/:payment_id
     * (Status is included in the payment object)
     */
    getStatus: (paymentId: string): Promise<PaymentStatus> =>
      request<PaymentStatus>(this.baseUrl, this.apiKey, 'GET', `/api/payments/${paymentId}`),

    /**
     * List recent payments.
     * 
     * Canonical route: GET /api/payments
     */
    list: (params?: { page?: number; limit?: number; status?: string }): Promise<{ payments: Payment[]; total: number }> => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.status) qs.set('status', params.status);
      const query = qs.toString();
      return request(this.baseUrl, this.apiKey, 'GET', `/api/payments${query ? `?${query}` : ''}`);
    },
  };

  // ── settlements ─────────────────────────────────────────────────────────────

  readonly settlements = {
    /**
     * List settlements for the authenticated merchant.
     * 
     * Canonical route: GET /api/settlements
     */
    list: (params?: {
      page?: number;
      limit?: number;
      status?: string;
      currency?: string;
      date_from?: string;
      date_to?: string;
    }): Promise<{ settlements: unknown[]; total: number }> => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.status) qs.set('status', params.status);
      if (params?.currency) qs.set('currency', params.currency);
      if (params?.date_from) qs.set('date_from', params.date_from);
      if (params?.date_to) qs.set('date_to', params.date_to);
      const query = qs.toString();
      return request(this.baseUrl, this.apiKey, 'GET', `/api/settlements${query ? `?${query}` : ''}`);
    },

    /**
     * Get settlement summary statistics.
     * 
     * Canonical route: GET /api/settlements/summary
     */
    summary: (): Promise<unknown> =>
      request(this.baseUrl, this.apiKey, 'GET', '/api/settlements/summary'),

    /**
     * Get a specific settlement by ID.
     * 
     * Canonical route: GET /api/settlements/:settlement_id
     */
    get: (settlementId: string): Promise<unknown> =>
      request(this.baseUrl, this.apiKey, 'GET', `/api/settlements/${settlementId}`),

    /**
     * Export settlement report.
     * 
     * Canonical route: GET /api/settlements/:settlement_id/export
     */
    export: (settlementId: string, format: 'pdf' | 'csv' = 'pdf'): Promise<Blob> =>
      request(this.baseUrl, this.apiKey, 'GET', `/api/settlements/${settlementId}/export?format=${format}`),
  };

  // ── merchant ────────────────────────────────────────────────────────────────

  readonly merchant = {
    /**
     * Get the authenticated merchant's profile.
     * 
     * Canonical route: GET /api/merchants/me
     */
    getProfile: (): Promise<unknown> =>
      request(this.baseUrl, this.apiKey, 'GET', '/api/merchants/me'),

    /**
     * Update the authenticated merchant's profile.
     * 
     * Canonical route: PATCH /api/merchants/me
     */
    updateProfile: (data: {
      business_name?: string;
      email?: string;
      settlement_schedule?: 'daily' | 'weekly';
      settlement_day?: number;
    }): Promise<unknown> =>
      request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me', data),

    /**
     * Update webhook URL.
     * 
     * Canonical route: PATCH /api/merchants/me/webhook
     */
    updateWebhook: (webhook_url: string): Promise<unknown> =>
      request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me/webhook', { webhook_url }),

    /**
     * Update settlement schedule.
     * 
     * Canonical route: PATCH /api/merchants/me/settlement-schedule
     */
    updateSettlementSchedule: (data: {
      settlement_schedule: 'daily' | 'weekly';
      settlement_day?: number;
    }): Promise<unknown> =>
      request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me/settlement-schedule', data),

    /**
     * Add a bank account for settlements.
     * 
     * Canonical route: POST /api/merchants/me/bank-account
     */
    addBankAccount: (data: {
      account_number: string;
      bank_name: string;
      bank_code: string;
      account_name?: string;
    }): Promise<unknown> =>
      request(this.baseUrl, this.apiKey, 'POST', '/api/merchants/me/bank-account', data),
  };

  // ── webhooks ────────────────────────────────────────────────────────────────

  readonly webhooks = {
    /**
     * Verify a webhook signature.
     *
     * FluxaPay signs webhook payloads using HMAC-SHA256.
     * The signature covers the payload **and** the timestamp header, so
     * provide the same `X-FluxaPay-Timestamp` value if you have it.
     *
     * @example
     * ```ts
     * const isValid = client.webhooks.verify(rawBody, signature, webhookSecret, timestamp);
     * if (!isValid) throw new Error('Invalid webhook signature');
     * const event = JSON.parse(rawBody) as WebhookEvent;
     * ```
     */
    verify: (rawBody: string, signature: string, webhookSecret: string, timestamp?: string): boolean => {
      // Node.js crypto – works in Node 18+. Browser usage is not recommended
      // (never expose your webhook secret client-side).
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const crypto = require('crypto') as typeof import('crypto');
        // include timestamp if provided
        let data = rawBody;
        if (timestamp) {
          data = `${timestamp}.${rawBody}`;
        }
        const expected = crypto
          .createHmac('sha256', webhookSecret)
          .update(data)
          .digest('hex');
        // Timing-safe comparison
        const sigBuffer = Buffer.from(signature);
        const expBuffer = Buffer.from(expected);
        return (
          sigBuffer.length === expBuffer.length &&
          crypto.timingSafeEqual(sigBuffer, expBuffer)
        );
      } catch {
        return false;
      }
    },

    /**
     * Parse and return a typed `WebhookEvent` from the raw body string.
     * Always call `verify()` before parsing in production.
     */
    parse: (rawBody: string): WebhookEvent => {
      return JSON.parse(rawBody) as WebhookEvent;
    },
  };
}

export default FluxaPay;
