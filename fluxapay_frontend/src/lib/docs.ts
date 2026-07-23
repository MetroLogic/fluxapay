// Documentation URLs
// STATUS_URL can be overridden via NEXT_PUBLIC_STATUS_URL env var (e.g. https://status.fluxapay.com)
const STATUS_URL = process.env.NEXT_PUBLIC_STATUS_URL ?? "/status";

export const DOCS_URLS = {
  API_REFERENCE: "/docs/api-reference",
  GETTING_STARTED: "/docs/getting-started",
  AUTHENTICATION: "/docs/authentication",
  /** Webhook HMAC / signature verification (see on-page section). */
  WEBHOOK_VERIFICATION: "/docs/authentication#webhook-verification",
  RATE_LIMITS: "/docs/rate-limits",
  FULL_DOCS: "/docs",
  COMMUNITY: "/community",
  SUPPORT: "/support",
  STATUS: STATUS_URL,
  FAQS: "/faqs",
  CONTACT: "/contact",
  PRICING: "/pricing",
} as const;
