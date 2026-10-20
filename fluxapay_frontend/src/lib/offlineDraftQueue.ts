/**
 * IndexedDB-backed queue for payment link / invoice drafts created offline.
 * Drafts get a local UUID and timestamp and are drained by `syncOfflineDrafts`
 * once connectivity returns.
 */

export type OfflineDraftKind = 'payment_link' | 'invoice';

export interface OfflineDraft {
  id: string;
  kind: OfflineDraftKind;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface OfflineDraftStore {
  put(draft: OfflineDraft): Promise<void>;
  getAll(): Promise<OfflineDraft[]>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'fluxapay-offline-drafts';
const STORE = 'drafts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Default IndexedDB store implementation. */
export const idbDraftStore: OfflineDraftStore = {
  async put(draft) {
    await withStore('readwrite', (s) => s.put(draft));
  },
  async getAll() {
    const all = await withStore<OfflineDraft[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },
  async remove(id) {
    await withStore('readwrite', (s) => s.delete(id));
  },
};

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Serialize and save a draft to the queue. */
export async function enqueueOfflineDraft(
  kind: OfflineDraftKind,
  payload: Record<string, unknown>,
  store: OfflineDraftStore = idbDraftStore,
): Promise<OfflineDraft> {
  const draft: OfflineDraft = {
    id: uuid(),
    kind,
    payload: JSON.parse(JSON.stringify(payload)),
    createdAt: Date.now(),
    attempts: 0,
  };
  await store.put(draft);
  return draft;
}

export async function listOfflineDrafts(
  store: OfflineDraftStore = idbDraftStore,
): Promise<OfflineDraft[]> {
  return store.getAll();
}

export interface SyncOptions {
  /** Sends one draft to the backend; must throw on failure. */
  send: (draft: OfflineDraft) => Promise<void>;
  store?: OfflineDraftStore;
  /** Max send attempts per draft within one drain (default 3). */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff between attempts (default 500). */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface SyncResult {
  synced: OfflineDraft[];
  failed: OfflineDraft[];
}

/**
 * Drain the queue in creation order. Each draft is retried with exponential
 * backoff; drafts that still fail stay queued for the next reconnect.
 */
export async function syncOfflineDrafts(opts: SyncOptions): Promise<SyncResult> {
  const store = opts.store ?? idbDraftStore;
  const maxAttempts = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const result: SyncResult = { synced: [], failed: [] };

  for (const draft of await store.getAll()) {
    let done = false;
    for (let attempt = 0; attempt < maxAttempts && !done; attempt++) {
      try {
        await opts.send(draft);
        await store.remove(draft.id);
        result.synced.push(draft);
        done = true;
      } catch (err) {
        draft.attempts += 1;
        draft.lastError = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts - 1) await sleep(base * 2 ** attempt);
      }
    }
    if (!done) {
      await store.put(draft);
      result.failed.push(draft);
    }
  }
  return result;
}
