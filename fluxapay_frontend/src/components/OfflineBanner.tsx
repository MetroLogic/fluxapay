"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const t = useTranslations("common");

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 px-4 py-3">
      <div className="flex items-center justify-center gap-2 max-w-7xl mx-auto">
        <AlertCircle className="h-4 w-4 text-yellow-600" aria-hidden="true" />
        <span className="text-sm text-yellow-800" role="status" aria-live="polite">
          {t("offlineMessage")}
        </span>
      </div>
    </div>
  );
}
