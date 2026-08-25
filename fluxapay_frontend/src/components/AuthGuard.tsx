"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { refreshAccessToken } from "@/lib/api";
import {
  REFRESH_LEAD_MS,
  getMsUntilExpiry,
  handleSessionExpired,
  isTokenExpired,
  scheduleAt,
} from "@/lib/session";

function readToken(): string | null {
  return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

/**
 * Client-side auth guard.
 *
 * The middleware (middleware.ts) already redirects unauthenticated requests
 * to /login at the edge, preventing flash of protected content for users
 * who have never had a token. This component handles the residual cases the
 * edge cannot see:
 *
 * - the token was cleared client-side (e.g. explicit logout in another tab)
 * - the token was still valid at page load and **expires while the user sits
 *   on the page**. The edge check ran once, at navigation; without a timer
 *   here the user keeps a rendered dashboard whose every request 401s, with
 *   nothing on screen explaining why.
 *
 * On mount the guard reads the token's `exp` and schedules a refresh
 * {@link REFRESH_LEAD_MS} before it. If the refresh succeeds the timer is
 * re-armed against the new expiry; if it fails, or there is no refresh token
 * to spend, the session ends with a toast rather than silently rotting.
 *
 * Renders nothing (`null`) until the auth check completes so there is no
 * flash of protected UI before a potential redirect.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const token = readToken();

    if (!token) {
      // Build the full current URL so login can redirect back after auth.
      const qs = searchParams.toString();
      const currentUrl = `${pathname}${qs ? `?${qs}` : ""}`;
      router.replace(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }

    if (isTokenExpired(token)) {
      // Already dead on arrival — do not render protected content at all.
      handleSessionExpired();
      return;
    }

    setIsAuthorized(true);
  }, [pathname, searchParams, router]);

  // Expiry timer. Separate from the mount check so it can re-arm itself after
  // a successful refresh without re-running the authorisation logic.
  useEffect(() => {
    if (!isAuthorized) return;

    let cancelled = false;
    let cancelTimer: (() => void) | null = null;

    const arm = () => {
      if (cancelled) return;

      const token = readToken();
      if (!token) {
        handleSessionExpired();
        return;
      }

      const msUntilExpiry = getMsUntilExpiry(token);
      if (msUntilExpiry === null) {
        // An opaque token gives us nothing to schedule against. The 401
        // interceptor in lib/api.ts remains the backstop.
        return;
      }

      // Fire immediately if we are already inside the lead window.
      const delay = Math.max(0, msUntilExpiry - REFRESH_LEAD_MS);

      cancelTimer = scheduleAt(delay, () => {
        if (cancelled) return;

        void refreshAccessToken()
          .then((refreshed) => {
            if (cancelled) return;
            if (!refreshed) {
              // No refresh token to spend; the access token is about to die.
              handleSessionExpired();
              return;
            }
            arm();
          })
          .catch(() => {
            if (cancelled) return;
            handleSessionExpired();
          });
      });
    };

    arm();

    return () => {
      cancelled = true;
      cancelTimer?.();
    };
  }, [isAuthorized]);

  // Return null until we confirm the user is authorised — this prevents any
  // flash of protected content before the redirect fires.
  if (!isAuthorized) return null;

  return <>{children}</>;
}
