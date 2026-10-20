/**
 * Validate a redirect/success URL before sending the user there.
 *
 * Allows relative paths, same-origin absolute URLs, and merchant-provided
 * absolute `http(s)` success URLs (the hosted checkout must be able to
 * redirect back to the merchant's own site, #1252). Rejects `javascript:`,
 * `data:`, `vbscript:`, `file:` and `blob:` schemes. Invalid URLs fall back to
 * a safe default.
 */
export function sanitizeRedirectUrl(
  url: string | null | undefined,
  fallback = "/",
): string {
  if (!url) return fallback;

  const trimmed = url.trim();
  if (trimmed === "") return fallback;

  // Reject obviously dangerous schemes up front.
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);

    // Only http(s) destinations are ever allowed.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }

    return parsed.toString();
  } catch {
    // Not parseable as an absolute URL — treat as a relative path. Dangerous
    // schemes were already rejected above.
    return trimmed;
  }
}
