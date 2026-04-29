"use client";

import { ReactNode } from "react";
import { SWRConfig } from "swr";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";
import { toastApiError } from "@/lib/toastApiError";
import { handleAuthError } from "@/lib/auth";

export function Providers({ children }: { children: ReactNode }) {
  return (
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
  );
}
