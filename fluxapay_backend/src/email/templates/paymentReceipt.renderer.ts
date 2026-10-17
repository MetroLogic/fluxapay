import {
  DEFAULT_LOCALE,
  PAYMENT_RECEIPT_CATALOG,
  ReceiptStrings,
} from "./paymentReceipt.catalog";

export interface ReceiptData {
  name: string;
  amount: string;
  currency: string;
  paymentId: string;
  merchantReference?: string;
  explorerLink: string;
  timestamp: string;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Builds the fallback chain, e.g. "pt-BR" -> ["pt-br","pt","en"]. */
export function resolveLocaleChain(locale?: string | null): string[] {
  const chain: string[] = [];
  if (locale) {
    const tag = locale.trim().toLowerCase().replace(/_/g, "-");
    if (tag) {
      if (PAYMENT_RECEIPT_CATALOG[tag]) chain.push(tag);
      const base = tag.split("-")[0];
      if (base && PAYMENT_RECEIPT_CATALOG[base] && !chain.includes(base)) chain.push(base);
    }
  }
  if (!chain.includes(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
  return chain;
}

/** Picks the first supported locale from an Accept-Language header value. */
export function pickLocaleFromAcceptLanguage(header?: string | null): string | undefined {
  if (!header) return undefined;
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim(), q: q ? parseFloat(q) : 1 };
    })
    .filter((c) => c.tag && c.tag !== "*")
    .sort((a, b) => b.q - a.q);
  for (const c of candidates) {
    const chain = resolveLocaleChain(c.tag);
    if (chain[0] !== DEFAULT_LOCALE || c.tag.toLowerCase().startsWith("en")) return chain[0];
  }
  return undefined;
}

function strings(locale?: string | null): ReceiptStrings {
  const chain = resolveLocaleChain(locale);
  const out = {} as ReceiptStrings;
  for (const key of Object.keys(PAYMENT_RECEIPT_CATALOG[DEFAULT_LOCALE]) as (keyof ReceiptStrings)[]) {
    for (const loc of chain) {
      const v = PAYMENT_RECEIPT_CATALOG[loc]?.[key];
      if (v) {
        out[key] = v;
        break;
      }
    }
  }
  return out;
}

export function renderPaymentReceipt(
  data: ReceiptData,
  locale?: string | null,
): { subject: string; html: string; locale: string } {
  const s = strings(locale);
  const used = resolveLocaleChain(locale)[0];
  const subject = s.subject
    .replace("{amount}", data.amount)
    .replace("{currency}", data.currency);
  const row = (label: string, value: string, mono = false) =>
    `<tr><td style="padding: 8px 0;"><strong>${escapeHtml(label)}:</strong></td><td style="padding: 8px 0;${mono ? " font-family: monospace; font-size: 12px;" : ""}">${escapeHtml(value)}</td></tr>`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" lang="${escapeHtml(used)}">
      <h2>${escapeHtml(s.title)}</h2>
      <p>${escapeHtml(s.greeting.replace("{name}", data.name))}</p>
      <p>${escapeHtml(s.intro)}</p>
      <div style="background: #f4f4f4; padding: 16px; border-radius: 4px; margin: 16px 0;">
        <h3 style="margin-top: 0;">${escapeHtml(s.details)}</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${row(s.amount, `${data.amount} ${data.currency}`)}
          ${row(s.paymentId, data.paymentId, true)}
          ${data.merchantReference ? row(s.reference, data.merchantReference) : ""}
          ${row(s.time, new Date(data.timestamp).toLocaleString(used))}
        </table>
      </div>
      <p><a href="${escapeHtml(data.explorerLink)}" style="display: inline-block; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px;">${escapeHtml(s.viewExplorer)}</a></p>
      <p style="color: #666; font-size: 14px; margin-top: 24px;">${escapeHtml(s.footer)}</p>
      <p>— ${escapeHtml(s.signature)}</p>
    </div>`;
  return { subject, html, locale: used };
}
