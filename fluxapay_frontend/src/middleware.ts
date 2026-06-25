import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextRequest, NextResponse } from "next/server";

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

export default function middleware(request: NextRequest) {
  const isMaintenanceMode =
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

  if (isMaintenanceMode) {
    const { pathname } = request.nextUrl;

    // Allow static files, Next.js internals, and bypass paths through
    const isBypassed =
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/favicon") ||
      MAINTENANCE_BYPASS.some((p) => pathname === p || pathname.startsWith(p + "/"));

    if (!isBypassed) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Locale entrypoints + unprefixed auth URLs. With `localePrefix: 'as-needed'`, `/en/signup`
  // redirects to `/signup`; those paths must still run next-intl middleware or they 404 (no `[locale]` segment).
  // Dashboard and other non-localized routes stay outside this list.
  matcher: [
    "/",
    "/(en|fr|pt)/:path*",
    "/signup",
    "/login",
    "/verify-otp",
    "/forgot-password",
    "/reset-password",
    "/docs",
    "/docs/:path*",
    "/pricing",
    "/faqs",
    "/contact",
    "/community",
    "/support",
    "/status",
    "/privacy",
    "/terms",
    "/maintenance",
  ],
};
