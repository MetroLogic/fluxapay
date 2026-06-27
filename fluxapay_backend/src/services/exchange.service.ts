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

import { sanitizeObject } from "../utils/piiRedactor";
import { redisClient } from "../middleware/redisIdempotency.middleware";
import { getLogger } from "../utils/logger";

const logger = getLogger();

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
  /** Raw partner payload for audit (sanitized) */
  raw_partner_payload?: any;
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

export interface CachedFxRate {
  exchange_rate: number;
  fiat_currency: string;
  cached_at: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// FX Rate Caching (Redis) – 5-minute TTL with stale fallback
// ──────────────────────────────────────────────────────────────────────────────

const FX_CACHE_TTL = 300; // 5 minutes in seconds
const FX_STALE_TTL = 3600; // 1 hour for stale fallback

function getCacheKey(fromCurrency: string, toCurrency: string): string {
  return `fx_rate:${fromCurrency}:${toCurrency}`;
}

export async function getCachedFxRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<CachedFxRate | null> {
  try {
    const key = getCacheKey(fromCurrency, toCurrency);
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    logger.warn('Failed to retrieve cached FX rate', { fromCurrency, toCurrency, error: err });
    return null;
  }
}

export async function getStaleFxRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<CachedFxRate | null> {
  try {
    const key = `${getCacheKey(fromCurrency, toCurrency)}:stale`;
    const stale = await redisClient.get(key);
    if (stale) {
      return JSON.parse(stale);
    }
    return null;
  } catch (err) {
    logger.warn('Failed to retrieve stale FX rate', { fromCurrency, toCurrency, error: err });
    return null;
  }
}

async function cacheFxRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): Promise<void> {
  try {
    const key = getCacheKey(fromCurrency, toCurrency);
    const staleKey = `${key}:stale`;
    const cacheData: CachedFxRate = {
      exchange_rate: rate,
      fiat_currency: toCurrency,
      cached_at: new Date().toISOString(),
    };

    // Cache for 5 minutes
    await redisClient.setex(key, FX_CACHE_TTL, JSON.stringify(cacheData));
    // Also store as stale copy for 1 hour (fallback if API is down)
    await redisClient.setex(staleKey, FX_STALE_TTL, JSON.stringify(cacheData));
  } catch (err) {
    logger.warn('Failed to cache FX rate', { fromCurrency, toCurrency, error: err });
  }
}

async function getQuoteWithFallback(
  partner: ExchangePartner,
  usdcAmount: number,
  targetCurrency: string,
): Promise<ExchangeQuoteResult> {
  try {
    const quote = await partner.getQuote(usdcAmount, targetCurrency);
    // Cache the successful rate
    await cacheFxRate('USDC', targetCurrency, quote.exchange_rate);
    return quote;
  } catch (err) {
    // API call failed, try stale rate
    logger.warn('FX API call failed, attempting stale fallback', { targetCurrency, error: err });
    const staleRate = await getStaleFxRate('USDC', targetCurrency);
    if (staleRate) {
      logger.warn('Using stale FX rate as fallback', { targetCurrency, rate: staleRate.exchange_rate });
      return {
        fiat_gross: parseFloat((usdcAmount * staleRate.exchange_rate).toFixed(2)),
        exchange_rate: staleRate.exchange_rate,
        fiat_currency: staleRate.fiat_currency,
      };
    }
    // If no stale rate available, rethrow the original error
    throw err;
  }
}

export async function getAllCachedFxRates(): Promise<Record<string, CachedFxRate>> {
  try {
    const keys = await redisClient.keys('fx_rate:USDC:*');
    const rates: Record<string, CachedFxRate> = {};

    for (const key of keys) {
      if (key.includes(':stale')) continue;
      const cached = await redisClient.get(key);
      if (cached) {
        const currency = key.replace('fx_rate:USDC:', '');
        rates[currency] = JSON.parse(cached);
      }
    }

    return rates;
  } catch (err) {
    logger.error('Failed to retrieve all cached FX rates', { error: err });
    return {};
  }
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

export class MockExchangePartner implements ExchangePartner {
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

    const transferRef = `mock_transfer_${reference}_${Date.now()}`;
    const exchangeRef = `mock_exchange_${Date.now()}`;
    return {
      transfer_ref: transferRef,
      exchange_ref: exchangeRef,
      initiated_at: new Date().toISOString(),
      raw_partner_payload: {
        partner: 'mock',
        transfer_ref: transferRef,
        exchange_ref: exchangeRef,
        usdc_amount: usdcAmount,
        target_currency: targetCurrency,
        reference,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Yellow Card partner (https://docs.yellowcard.io)
// ──────────────────────────────────────────────────────────────────────────────

export class YellowCardPartner implements ExchangePartner {
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
    // Check cache first
    const cached = await getCachedFxRate('USDC', targetCurrency);
    if (cached) {
      return {
        fiat_gross: parseFloat((usdcAmount * cached.exchange_rate).toFixed(2)),
        exchange_rate: cached.exchange_rate,
        fiat_currency: cached.fiat_currency,
        quote_ref: `cached_${cached.cached_at}`,
      };
    }

    // Yellow Card quote endpoint (adapt path as per live docs)
    const data = await this.request<{
      rate: number;
      destinationAmount: number;
      quoteId: string;
    }>(`/v2/rates?from=USDC&to=${targetCurrency}&amount=${usdcAmount}`);

    const result = {
      fiat_gross: data.destinationAmount,
      exchange_rate: data.rate,
      fiat_currency: targetCurrency,
      quote_ref: data.quoteId,
    };

    // Cache the rate for future use
    await cacheFxRate('USDC', targetCurrency, data.rate);
    return result;
  }

  async convertAndPayout(
    usdcAmount: number,
    targetCurrency: string,
    bankAccount: BankAccountDetails,
    reference: string,
  ): Promise<PayoutResult> {
    const quote = await getQuoteWithFallback(this, usdcAmount, targetCurrency);

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
      raw_partner_payload: {
        partner: 'yellowcard',
        response: sanitizeObject(data),
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Anchor partner (https://docs.anchorusd.com)
// ──────────────────────────────────────────────────────────────────────────────

export class AnchorPartner implements ExchangePartner {
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
    // Check cache first
    const cached = await getCachedFxRate('USDC', targetCurrency);
    if (cached) {
      return {
        fiat_gross: parseFloat((usdcAmount * cached.exchange_rate).toFixed(2)),
        exchange_rate: cached.exchange_rate,
        fiat_currency: cached.fiat_currency,
      };
    }

    const data = await this.request<{
      rate: number;
      fiat_amount: number;
    }>(`/v1/quote?source_currency=USDC&dest_currency=${targetCurrency}&amount=${usdcAmount}`);

    const result = {
      fiat_gross: data.fiat_amount,
      exchange_rate: data.rate,
      fiat_currency: targetCurrency,
    };

    // Cache the rate for future use
    await cacheFxRate('USDC', targetCurrency, data.rate);
    return result;
  }

  async convertAndPayout(
    usdcAmount: number,
    targetCurrency: string,
    bankAccount: BankAccountDetails,
    reference: string,
  ): Promise<PayoutResult> {
    const quote = await getQuoteWithFallback(this, usdcAmount, targetCurrency);

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
      exchange_ref: quote.quote_ref,
      initiated_at: new Date().toISOString(),
      raw_partner_payload: {
        partner: 'anchor',
        response: sanitizeObject(data),
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory – selects the active partner from env
// ──────────────────────────────────────────────────────────────────────────────

let _instance: ExchangePartner | null = null;

export function resetExchangePartnerForTests(): void {
  _instance = null;
}

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
