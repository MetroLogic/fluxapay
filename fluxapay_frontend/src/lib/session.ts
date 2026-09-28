/**
 * Session expiry handling shared by the API layer and the auth guard.
 *
 * Deliberately free of imports from `./api` and `./auth`: both of those import
 * from each other already, and adding a third edge would close the cycle. This
 * module owns nothing but the expiry decision, so it can sit underneath both.
 */

import toast from "react-hot-toast";

/** Shown once when a session ends because the token expired. */
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please log in again.";

/**
 * How far ahead of expiry to attempt a refresh.
 *
 * Long enough to absorb a slow round trip on a bad connection, short enough
 * that a tab left open overnight is not refreshing a token nobody is using.
 */
export const REFRESH_LEAD_MS = 60_000;

/** `setTimeout` clamps above this; anything longer is re-scheduled in chunks. */
const MAX_TIMEOUT_MS = 2_147_483_647;

const TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refresh_token";
const ADMIN_KEY = "isAdmin";

/**
 * Guards against a burst of concurrent 401s producing a stack of toasts and a
 * redirect per failed request. The first one wins; the rest are no-ops.
 */
let expiryHandled = false;

/** Test seam — resets the once-only latch. */
export function resetSessionExpiryLatch(): void {
  expiryHandled = false;
}

/**
 * Read the `exp` claim from a JWT, as epoch milliseconds.
 *
 * Returns null for anything that is not a decodable JWT with a numeric `exp`.
 * The signature is not verified and must not be trusted for anything but
 * scheduling — the server remains the authority on whether a token is valid.
 */
export function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    // JWTs use base64url; atob wants standard base64 with padding.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as { exp?: unknown };

    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Milliseconds until `token` expires; negative when already expired. */
export function getMsUntilExpiry(token: string, now: number = Date.now()): number | null {
  const expiryMs = getTokenExpiryMs(token);
  return expiryMs === null ? null : expiryMs - now;
}

/** Whether `token` is already past its `exp`. Unreadable tokens count as expired. */
export function isTokenExpired(token: string, now: number = Date.now()): boolean {
  const remaining = getMsUntilExpiry(token, now);
  return remaining === null ? true : remaining <= 0;
}

/** Remove every auth artefact from both storages. */
export function clearSessionStorageKeys(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Storage can throw in private-mode Safari; a failed cleanup must not stop
    // the redirect, which is the part that actually protects the user.
  }
}

/**
 * End the session: clear the token, tell the user why, and send them to login
 * with a redirect back to wherever they were.
 *
 * Safe to call from anywhere and any number of times — only the first call in
 * a page lifetime does anything.
 */
export function handleSessionExpired(options: { silent?: boolean } = {}): void {
  if (expiryHandled) return;
  expiryHandled = true;

  clearSessionStorageKeys();

  if (typeof window === "undefined") return;

  if (window.location.pathname.includes("/login")) {
    // Already where we would send them; a toast here would just be noise.
    return;
  }

  if (!options.silent) {
    toast.error(SESSION_EXPIRED_MESSAGE, { id: "session-expired" });
  }

  const currentUrl = window.location.pathname + window.location.search;
  window.location.href = `/login?redirect=${encodeURIComponent(currentUrl)}`;
}

/**
 * Run `callback` at `delayMs`, chunking delays beyond `setTimeout`'s 32-bit
 * ceiling. A 30-day token would otherwise overflow and fire immediately.
 *
 * Returns a cancel function.
 */
export function scheduleAt(delayMs: number, callback: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const arm = (remaining: number) => {
    if (cancelled) return;
    const slice = Math.min(remaining, MAX_TIMEOUT_MS);
    timer = setTimeout(() => {
      if (cancelled) return;
      const left = remaining - slice;
      if (left > 0) arm(left);
      else callback();
    }, Math.max(0, slice));
  };

  arm(delayMs);

  return () => {
    cancelled = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
