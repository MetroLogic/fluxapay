'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  enqueueOfflineDraft,
  listOfflineDrafts,
  syncOfflineDrafts,
  type OfflineDraft,
  type OfflineDraftKind,
} from '@/lib/offlineDraftQueue';

/**
 * Queue payment link / invoice submissions while offline and sync them
 * automatically when connectivity returns.
 *
 * `send` posts one draft to the backend and must throw on failure.
 */
export function useOfflineDrafts(send: (draft: OfflineDraft) => Promise<void>) {
  const isOnline = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const syncing = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;

  const refresh = useCallback(async () => {
    setPending((await listOfflineDrafts()).length);
  }, []);

  const saveDraft = useCallback(
    async (kind: OfflineDraftKind, payload: Record<string, unknown>) => {
      const draft = await enqueueOfflineDraft(kind, payload);
      await refresh();
      return draft;
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isOnline || syncing.current) return;
    syncing.current = true;
    syncOfflineDrafts({ send: (d) => sendRef.current(d) })
      .then(({ synced, failed }) => {
        if (synced.length) toast.success(`Synced ${synced.length} offline draft(s)`);
        if (failed.length) toast.error(`${failed.length} draft(s) failed to sync; will retry`);
      })
      .catch(() => undefined)
      .finally(() => {
        syncing.current = false;
        void refresh();
      });
  }, [isOnline, refresh]);

  return { isOnline, pending, saveDraft };
}
