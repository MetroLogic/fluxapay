'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  enqueueCheckoutAction,
  getPendingActions,
  markActionSynced,
  clearSyncedActions,
  type QueuedCheckoutAction,
} from '@/lib/idb-queue';

interface UseOfflineSyncReturn {
  pendingCount: number;
  queueAction: (type: QueuedCheckoutAction['type']) => Promise<void>;
}

export function useOfflineSync(
  paymentId: string,
  onSync: () => Promise<void>,
): UseOfflineSyncReturn {
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (typeof indexedDB === 'undefined') return;
    const pending = await getPendingActions(paymentId);
    setPendingCount(pending.length);
  }, [paymentId]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = async () => {
      if (typeof indexedDB === 'undefined') return;
      const pending = await getPendingActions(paymentId);
      if (pending.length === 0) return;

      try {
        await onSync();
        await Promise.all(
          pending
            .filter((a): a is QueuedCheckoutAction & { id: number } => a.id !== undefined)
            .map((a) => markActionSynced(a.id)),
        );
        await clearSyncedActions();
        setPendingCount(0);
      } catch {
        // Sync failed — actions remain queued for the next online event
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [paymentId, onSync]);

  const queueAction = useCallback(
    async (type: QueuedCheckoutAction['type']) => {
      if (typeof indexedDB === 'undefined') return;
      await enqueueCheckoutAction(paymentId, type);
      await refreshCount();
    },
    [paymentId, refreshCount],
  );

  return { pendingCount, queueAction };
}
