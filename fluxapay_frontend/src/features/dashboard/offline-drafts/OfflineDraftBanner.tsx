'use client';

import React from 'react';

interface Props {
  isOnline: boolean;
  pending?: number;
}

/** Banner shown on Create Payment Link / Create Invoice while offline. */
export function OfflineDraftBanner({ isOnline, pending = 0 }: Props) {
  if (isOnline && pending === 0) return null;
  return (
    <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      {isOnline
        ? `Syncing ${pending} offline draft(s)...`
        : `Offline Mode - Will Sync When Online${pending ? ` (${pending} queued)` : ''}`}
    </div>
  );
}
