"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds only.
 * This component renders nothing — it exists solely for its side effect.
 * Keeping registration in a client component avoids interfering with
 * Next.js hot-module replacement in development.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("SW registration failed:", err));
    }
  }, []);

  return null;
}
