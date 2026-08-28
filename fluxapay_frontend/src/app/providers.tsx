"use client";

import { ReactNode } from "react";
import { SWRConfig } from "swr";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";
import { ThemeProvider } from "@/components/ThemeProvider";
import { OfflineBanner } from "@/components/OfflineBanner";
import { toastApiError } from "@/lib/toastApiError";
import { handleAuthError } from "@/lib/auth";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <GlobalErrorBoundary>
        <SWRConfig value={{
          onError: (error) => {
            handleAuthError(error);
            toastApiError(error);
          }
        }}>
          <OfflineBanner />
          {children}
        </SWRConfig>
      </GlobalErrorBoundary>
    </ThemeProvider>
  );
}
