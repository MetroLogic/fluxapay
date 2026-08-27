"use client";

import { ReactNode, useEffect } from "react";
import { SWRConfig } from "swr";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";
import { ThemeProvider } from "@/components/ThemeProvider";
import { toastApiError } from "@/lib/toastApiError";
import { handleAuthError } from "@/lib/auth";
import { initWebVitalsReporting } from "@/app/lib/reportWebVitals";

export function Providers({ children }: { children: ReactNode }) {
  // Initialize Web Vitals reporting on client mount
  useEffect(() => {
    initWebVitalsReporting();
  }, []);
  return (
    <ThemeProvider>
      <GlobalErrorBoundary>
        <SWRConfig value={{
          onError: (error) => {
            handleAuthError(error);
            toastApiError(error);
          }
        }}>
          {children}
        </SWRConfig>
      </GlobalErrorBoundary>
    </ThemeProvider>
  );
}
