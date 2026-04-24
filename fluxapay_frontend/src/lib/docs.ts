// Documentation URLs
// STATUS_URL can be overridden via NEXT_PUBLIC_STATUS_URL env var (e.g. https://status.fluxapay.com)
const STATUS_URL = process.env.NEXT_PUBLIC_STATUS_URL ?? "/status";

// EXTERNAL_DOCS_URL can be overridden via NEXT_PUBLIC_EXTERNAL_DOCS_URL env var (e.g. https://docs.fluxapay.com)
const EXTERNAL_DOCS_URL = process.env.NEXT_PUBLIC_EXTERNAL_DOCS_URL;

export const DOCS_URLS = {
  API_REFERENCE: EXTERNAL_DOCS_URL ? `${EXTERNAL_DOCS_URL}/api-reference` : "/docs/api-reference",
  GETTING_STARTED: EXTERNAL_DOCS_URL ? `${EXTERNAL_DOCS_URL}/getting-started` : "/docs/getting-started",
  AUTHENTICATION: EXTERNAL_DOCS_URL ? `${EXTERNAL_DOCS_URL}/authentication` : "/docs/authentication",
  RATE_LIMITS: EXTERNAL_DOCS_URL ? `${EXTERNAL_DOCS_URL}/rate-limits` : "/docs/rate-limits",
  FULL_DOCS: EXTERNAL_DOCS_URL ?? "/docs",
  COMMUNITY: "/community",
  SUPPORT: "/support",
  STATUS: STATUS_URL,
  FAQS: "/faqs",
  CONTACT: "/contact",
  PRICING: "/pricing",
} as const;
