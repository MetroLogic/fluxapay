/** Where an absent or untrusted `?redirect=` value lands instead. */
export const DEFAULT_REDIRECT = "/dashboard";

/** Control characters can smuggle a second target past a naive parse. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/**
 * Resolve a post-login `?redirect=` value to a safe same-origin path.
 *
 * The value reaches us straight from the query string, so an attacker controls
 * it: `/login?redirect=https://evil.com` would otherwise hand them a redirect
 * off our origin carrying the user's freshly authenticated session.
 *
 * Anything that does not resolve back to `origin` becomes
 * {@link DEFAULT_REDIRECT}. Rejecting `//host` and backslashes before parsing
 * matters because browsers treat `\` as `/` in authority position, so
 * `/\evil.com` is protocol-relative in practice even though it looks relative.
 *
 * `origin` is injectable so the rules can be tested without a DOM.
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
): string {
  if (!raw) return DEFAULT_REDIRECT;

  const candidate = raw.trim();
  if (!candidate.startsWith("/")) return DEFAULT_REDIRECT;
  if (candidate.startsWith("//")) return DEFAULT_REDIRECT;
  if (candidate.includes("\\")) return DEFAULT_REDIRECT;
  if (hasControlChars(candidate)) return DEFAULT_REDIRECT;

  if (!origin) return DEFAULT_REDIRECT;

  let base: URL;
  let resolved: URL;
  try {
    base = new URL(origin);
    resolved = new URL(candidate, base);
  } catch {
    return DEFAULT_REDIRECT;
  }

  if (resolved.origin !== base.origin) return DEFAULT_REDIRECT;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
