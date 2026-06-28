import * as Sentry from "@sentry/nextjs";

/**
 * Set merchant context in Sentry.
 * Only includes merchant ID (no PII).
 */
export function setSentryMerchantContext(merchantId: string | null): void {
  if (merchantId) {
    Sentry.setUser({ id: merchantId });
  } else {
    Sentry.setUser(null);
  }
}
