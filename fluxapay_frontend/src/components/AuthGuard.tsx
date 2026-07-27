"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * Client-side auth guard.
 *
 * The middleware (middleware.ts) already redirects unauthenticated requests
 * to /login at the edge, preventing flash of protected content for users
 * who have never had a token. This component handles the residual case where
 * the token may have been cleared client-side (e.g. explicit logout in
 * another tab) after the initial server render.
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

    const token =
      localStorage.getItem("token") ?? sessionStorage.getItem("token");

    if (!token) {
      // Build the full current URL so login can redirect back after auth.
      const qs = searchParams.toString();
      const currentUrl = `${pathname}${qs ? `?${qs}` : ""}`;
      router.replace(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }

    setIsAuthorized(true);
  }, [pathname, searchParams, router]);

  // Return null until we confirm the user is authorised — this prevents any
  // flash of protected content before the redirect fires.
  if (!isAuthorized) return null;

  return <>{children}</>;
}
