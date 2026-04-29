"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const token = localStorage.getItem("token") ?? sessionStorage.getItem("token");
    
    if (!token) {
      const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      router.replace(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }

    setIsAuthorized(true);
  }, [pathname, searchParams, router]);

  if (!isAuthorized) {
    return null; // Return null instead of loading spinner to avoid layout shift before redirect
  }

  return <>{children}</>;
}
