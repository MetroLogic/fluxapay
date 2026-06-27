"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { AlertCircle, Wifi } from "lucide-react";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 px-4 py-3">
      <div className="flex items-center justify-center gap-2 max-w-7xl mx-auto">
        <AlertCircle className="h-4 w-4 text-yellow-600" />
        <span className="text-sm text-yellow-800">
          You are offline. Showing cached data. Reconnect to see the latest updates.
        </span>
      </div>
    </div>
  );
}
