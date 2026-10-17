import type { LineItem } from "./types";

/**
 * Pure helpers behind the invoice preview and PDF (issue #1254). They mirror
 * the backend's arithmetic (`invoice.service.ts`): subtotal = Σ qty × price,
 * tax = subtotal × rate / 100, total = subtotal + tax.
 */

export interface InvoicePreviewData {
  invoiceNumber?: string;
  merchant: {
    businessName: string;
    email?: string;
    country?: string;
  };
  customerName: string;
  customerEmail: string;
  currency: string;
  /** ISO date or `YYYY-MM-DD`. */
  dueDate: string;
  issueDate?: string;
  notes?: string;
  lineItems: LineItem[];
  /** Percent, 0–100. */
  taxRate?: number;
  /** URL the payable QR encodes; absent before the invoice exists. */
  paymentUrl?: string;
}

export interface PricedLine extends LineItem {
  amount: number;
}

export interface InvoiceTotals {
  lines: PricedLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

const CRYPTO_DECIMALS: Record<string, number> = { USDC: 2, XLM: 7 };

/** Decimal places used to display a currency. */
export function currencyDecimals(currency: string): number {
  return CRYPTO_DECIMALS[currency.toUpperCase()] ?? 2;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function computeInvoiceTotals(
  lineItems: LineItem[],
  taxRate = 0,
  currency = "USD",
): InvoiceTotals {
  const decimals = Math.max(2, currencyDecimals(currency));
  const lines = lineItems.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    return { ...item, quantity, unit_price: unitPrice, amount: round(quantity * unitPrice, decimals) };
  });
  const subtotal = round(lines.reduce((sum, l) => sum + l.amount, 0), decimals);
  const rate = Number.isFinite(taxRate) && taxRate > 0 ? Math.min(taxRate, 100) : 0;
  const taxAmount = round(subtotal * (rate / 100), decimals);
  return { lines, subtotal, taxRate: rate, taxAmount, total: round(subtotal + taxAmount, decimals) };
}

/**
 * Locale-aware money formatting. ISO 4217 codes use `Intl` currency style
 * (`$1,234.50`, `₦40,000.00`); codes Intl rejects (e.g. `USDC`) fall back to
 * grouped digits plus the code (`1,234.50 USDC`).
 */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  const decimals = currencyDecimals(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    const digits = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }).format(amount);
    return `${digits} ${currency}`;
  }
}

export function formatDate(value: string | undefined, locale?: string): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

/** Read the merchant's business details from `GET /merchants/me`. */
export function merchantFromProfile(body: unknown): InvoicePreviewData["merchant"] | null {
  const outer = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const inner = (outer.data && typeof outer.data === "object" ? outer.data : {}) as Record<string, unknown>;
  const m = (outer.merchant ?? inner.merchant ?? inner ?? outer) as Record<string, unknown>;
  const businessName = typeof m.business_name === "string" ? m.business_name.trim() : "";
  if (!businessName) return null;
  return {
    businessName,
    email: typeof m.email === "string" ? m.email : undefined,
    country: typeof m.country === "string" ? m.country : undefined,
  };
}
