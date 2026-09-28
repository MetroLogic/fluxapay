import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isBotUserAgent, paymentPageLimiter, logAbuseEvent } from "./lib/rateLimit";

const intlMiddleware = createMiddleware(routing);

/**
 * Paths that are always accessible even during maintenance mode.
 * Includes the maintenance page itself, static assets, and API routes.
 */
const MAINTENANCE_BYPASS = [
  "/maintenance",
  "/en/maintenance",
  "/fr/maintenance",
  "/pt/maintenance",
  "/status",
  "/en/status",
  "/fr/status",
  "/pt/status",
  "/support",
  "/en/support",
  "/fr/support",
  "/pt/support",
];

/**
 * Cookie/header name used by the backend JWT. We only check *presence*
 * here — full signature verification happens in the API layer.
 */
const AUTH_TOKEN_COOKIE = "token";

/**
 * Protected path prefixes that require an authenticated session.
 * Any request whose pathname starts with one of these values will be
 * redirected to /login (with `?redirect=<original>`) when no auth
 * token is present in cookies or the Authorization header.
 *
 * NOTE: The locale segment is stripped before matching so both
 * `/dashboard/payments` and `/en/dashboard/payments` are covered.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/admin",
];

/**
 * Admin-only path prefixes — a subset of PROTECTED_PREFIXES. Role validation
 * beyond token presence is enforced client-side by AdminGuard and on the
 * server by the backend; middleware only blocks unauthenticated requests.
 * Kept here for documentation and future middleware-level role checks.
 */
// const ADMIN_PREFIXES = ["/admin"];

/** Extract the path without locale prefix, e.g. /en/dashboard → /dashboard */
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(en|fr|pt)(\/|$)/, "/");
}

/** Return true if the request carries *any* auth token (cookie or header). */
function hasAuthToken(request: NextRequest): boolean {
  if (request.cookies.get(AUTH_TOKEN_COOKIE)?.value) return true;
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) return true;
  return false;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 0. Rate limiting for public payment pages ─────────────────────────────
  // Check if this is a payment page route: /pay/[payment_id] or /checkout/[charge_id]
  const isPaymentPage = /^\/pay\/[^/]+$/.test(pathname) || /^\/checkout\/[^/]+$/.test(pathname) ||
                        /^\/(en|fr|pt)\/pay\/[^/]+$/.test(pathname) || /^\/(en|fr|pt)\/checkout\/[^/]+$/.test(pathname);

  if (isPaymentPage) {
    const clientIp = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    // Bot detection
    if (isBotUserAgent(userAgent)) {
      logAbuseEvent('bot_detected_payment_page', clientIp, {
        pathname,
        userAgent,
      });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Rate limiting: max 30 requests per 60 seconds
    if (!paymentPageLimiter.isAllowed(clientIp)) {
      const resetMs = paymentPageLimiter.getResetTimeMs(clientIp);
      logAbuseEvent('payment_page_rate_limit_exceeded', clientIp, {
        pathname,
        resetMs,
      });
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(resetMs / 1000)),
          },
        }
      );
    }
  }

  // ── 1. Maintenance mode ──────────────────────────────────────────────────
  const isMaintenanceMode =
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

  if (isMaintenanceMode) {
    const isBypassed =
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/favicon") ||
      MAINTENANCE_BYPASS.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
      );

    if (!isBypassed) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      return NextResponse.redirect(url);
    }
  }

  // ── 2. Auth guard for protected routes ───────────────────────────────────
  const bare = stripLocale(pathname);
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => bare === p || bare.startsWith(p + "/"),
  );

  if (isProtected && !hasAuthToken(request)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Preserve the original destination so the login page can redirect back.
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 3. Delegate to next-intl for locale handling ─────────────────────────
  return intlMiddleware(request);
}

export const config = {
  /**
   * Matcher covers:
   *  - Locale entry-points handled by next-intl
   *  - Public auth / marketing routes that need next-intl
   *  - All /dashboard/* and /admin/* paths (with and without locale prefix)
   *  - Public payment pages (/pay/*, /checkout/*)
   *    so rate limiting and bot detection fires on direct URL navigation
   *
   * Static files (_next, api, images, etc.) are excluded by Next.js
   * automatically when they match /_next or /api, but we also exclude
   * them explicitly via the negative lookahead.
   */
  matcher: [
    // Exclude static assets and Next.js internals
    "/((?!_next|api|favicon|.*\\..*).*)",
  ],
};
