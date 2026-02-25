/**
 * exchange.service.ts
 *
 * Abstraction layer over on-/off-ramp partners (Yellow Card, Anchor, etc.).
 * The settlement engine calls `convertAndPayout`. Each partner is implemented
 * as a strategy that satisfies the `ExchangePartner` interface.
 *
 * Environment variables:
 *   EXCHANGE_PARTNER          – "yellowcard" | "anchor" | "mock" (default: mock)
 *   YELLOWCARD_API_KEY        – Yellow Card API key
 *   YELLOWCARD_API_URL        – Yellow Card base URL
 *   ANCHOR_API_KEY            – Anchor API key
 *   ANCHOR_API_URL            – Anchor base URL
 */

export interface ExchangeQuoteResult {
  /** Amount of fiat the merchant will receive before fees */
  fiat_gross: number;
  /** Exchange rate applied (1 USDC = X fiat) */
  exchange_rate: number;
  /** ISO 4217 fiat currency code */
  fiat_currency: string;
  /** Partner-specific quote / reference ID (if applicable) */
  quote_ref?: string;
}

export interface BankAccountDetails {
  account_name: string;
  account_number: string;
  bank_name: string;
  bank_code?: string;
  currency: string;
  country: string;
}

export interface PayoutResult {
  /** Unique transfer reference from the payout partner */
  transfer_ref: string;
  /** Exchange / quote reference used */
  exchange_ref?: string;
  /** ISO timestamp when payout was initiated */
  initiated_at: string;
}

export interface ExchangePartner {
  /**
   * Get a live quote for USDC → fiat conversion.
   */
  getQuote(usdcAmount: number, targetCurrency: string): Promise<ExchangeQuoteResult>;

  /**
   * Execute the conversion and initiate a bank transfer in one call.
   *
   * @param usdcAmount     – Amount in USDC to convert
   * @param targetCurrency – ISO 4217 currency code (e.g. "NGN", "KES")
   * @param bankAccount    – Merchant's bank account details
   * @param reference      – Internal settlement reference for idempotency
   */
  convertAndPayout(
    usdcAmount: number,
    targetCurrency: string,
    bankAccount: BankAccountDetails,
    reference: string,
  ): Promise<PayoutResult>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock partner (used in dev / test environments)
// ──────────────────────────────────────────────────────────────────────────────

const MOCK_RATES: Record<string, number> = {
  NGN: 1550,
  KES: 130,
  GHS: 15,
  ZAR: 18.5,
  UGX: 3750,
  TZS: 2600,
  USD: 1,
};

class MockExchangePartner implements ExchangePartner {
  async getQuote(usdcAmount: number, targetCurrency: string): Promise<ExchangeQuoteResult> {
    const rate = MOCK_RATES[targetCurrency] ?? 1;
    return {
      fiat_gross: parseFloat((usdcAmount * rate).toFixed(2)),
      exchange_rate: rate,
      fiat_currency: targetCurrency,
      quote_ref: `mock_quote_${Date.now()}`,
    };
  }

  async convertAndPayout(
    usdcAmount: number,
    targetCurrency: string,
    _bankAccount: BankAccountDetails,
    reference: string,
  ): Promise<PayoutResult> {
    // Simulate network latency
    await new Promise((r) => setTimeout(r, 200));

    console.log(
      `[MockExchange] Simulating payout: ${usdcAmount} USDC → ${targetCurrency} | ref: ${reference}`,
    );

    return {
      transfer_ref: `mock_transfer_${reference}_${Date.now()}`,
      exchange_ref: `mock_exchange_${Date.now()}`,
      initiated_at: new Date().toISOString(),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Yellow Card partner (https://docs.yellowcard.io)
// ──────────────────────────────────────────────────────────────────────────────

class YellowCardPartner implements ExchangePartner {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.YELLOWCARD_API_KEY ?? "";
    this.baseUrl = process.env.YELLOWCARD_API_URL ?? "https://api.yellowcard.io";
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`YellowCard API error [${res.status}]: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async getQuote(usdcAmount: number, targetCurrency: string): Promise<ExchangeQuoteResult> {
    // Yellow Card quote endpoint (adapt path as per live docs)
    const data = await this.request<{
      rate: number;
      destinationAmount: number;
      quoteId: string;
    }>(`/v2/rates?from=USDC&to=${targetCurrency}&amount=${usdcAmount}`);

    return {
      fiat_gross: data.destinationAmount,
      exchange_rate: data.rate,
      fiat_currency: targetCurrency,
      quote_ref: data.quoteId,
    };
  }

  async convertAndPayout(
    usdcAmount: number,
    targetCurrency: string,
    bankAccount: BankAccountDetails,
    reference: string,
  ): Promise<PayoutResult> {
    const quote = await this.getQuote(usdcAmount, targetCurrency);

    const data = await this.request<{
      transferId: string;
    }>("/v2/payments", {
      method: "POST",
      body: JSON.stringify({
        amount: usdcAmount,
        currency: "USDC",
        destination: {
          currency: targetCurrency,
          accountNumber: bankAccount.account_number,
          bankCode: bankAccount.bank_code,
          accountName: bankAccount.account_name,
          country: bankAccount.country,
        },
        quoteId: quote.quote_ref,
        externalId: reference,
      }),
    });

    return {
      transfer_ref: data.transferId,
      exchange_ref: quote.quote_ref,
      initiated_at: new Date().toISOString(),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Anchor partner (https://docs.anchorusd.com)
// ──────────────────────────────────────────────────────────────────────────────

class AnchorPartner implements ExchangePartner {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ANCHOR_API_KEY ?? "";
    this.baseUrl = process.env.ANCHOR_API_URL ?? "https://api.anchorusd.com";
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anchor API error [${res.status}]: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async getQuote(usdcAmount: number, targetCurrency: string): Promise<ExchangeQuoteResult> {
    const data = await this.request<{
      rate: number;
      fiat_amount: number;
    }>(`/v1/quote?source_currency=USDC&dest_currency=${targetCurrency}&amount=${usdcAmount}`);

    return {
      fiat_gross: data.fiat_amount,
      exchange_rate: data.rate,
      fiat_currency: targetCurrency,
    };
  }

  async convertAndPayout(
    usdcAmount: number,
    targetCurrency: string,
    bankAccount: BankAccountDetails,
    reference: string,
  ): Promise<PayoutResult> {
    const data = await this.request<{
      reference: string;
      exchange_id: string;
    }>("/v1/offramp/payout", {
      method: "POST",
      body: JSON.stringify({
        source_amount: usdcAmount,
        source_currency: "USDC",
        dest_currency: targetCurrency,
        bank_account: {
          account_number: bankAccount.account_number,
          account_name: bankAccount.account_name,
          bank_name: bankAccount.bank_name,
          bank_code: bankAccount.bank_code,
          country: bankAccount.country,
        },
        idempotency_key: reference,
      }),
    });

    return {
      transfer_ref: data.reference,
      exchange_ref: data.exchange_id,
      initiated_at: new Date().toISOString(),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory – selects the active partner from env
// ──────────────────────────────────────────────────────────────────────────────

let _instance: ExchangePartner | null = null;

export function getExchangePartner(): ExchangePartner {
  if (_instance) return _instance;

  const partner = (process.env.EXCHANGE_PARTNER ?? "mock").toLowerCase();

  switch (partner) {
    case "yellowcard":
      _instance = new YellowCardPartner();
      break;
    case "anchor":
      _instance = new AnchorPartner();
      break;
    default:
      _instance = new MockExchangePartner();
      break;
  }

  return _instance;
}
