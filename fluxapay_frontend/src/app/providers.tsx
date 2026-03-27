"use client";

import { ReactNode } from "react";
import { SWRConfig } from "swr";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";
import { toastApiError } from "@/lib/toastApiError";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <GlobalErrorBoundary>
      <SWRConfig value={{ onError: (error) => toastApiError(error) }}>
        {children}
      </SWRConfig>
    </GlobalErrorBoundary>
  );
}
