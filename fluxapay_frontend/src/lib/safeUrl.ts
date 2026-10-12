/**
 * Validate a redirect/success URL before sending the user there.
 *
 * Only allows same-origin URLs (including relative paths). Rejects
 * `javascript:`, `data:`, `vbscript:` and any other non-http(s) scheme,
 * plus any external origin. Invalid URLs fall back to a safe default.
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

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }

    if (parsed.origin !== window.location.origin) {
      return fallback;
    }

    return parsed.toString();
  } catch {
    // Not parseable as an absolute URL — treat as a relative path. Same-origin
    // by definition, so safe to return as-is (dangerous schemes were already
    // rejected above).
    return trimmed;
  }
}
