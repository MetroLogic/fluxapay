const DB_NAME = 'fluxapay-offline';
const DB_VERSION = 1;
const STORE_NAME = 'checkout-actions';

export interface QueuedCheckoutAction {
  id?: number;
  paymentId: string;
  type: 'retry-connection' | 'validate-payment';
  timestamp: number;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('paymentId', 'paymentId', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueCheckoutAction(
  paymentId: string,
  type: QueuedCheckoutAction['type'],
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const action: Omit<QueuedCheckoutAction, 'id'> = {
      paymentId,
      type,
      timestamp: Date.now(),
      synced: false,
    };
    const req = store.add(action);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getPendingActions(
  paymentId?: string,
): Promise<QueuedCheckoutAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const results: QueuedCheckoutAction[] = [];

    const source = paymentId
      ? store.index('paymentId').openCursor(IDBKeyRange.only(paymentId))
      : store.openCursor();

    source.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        const record = cursor.value as QueuedCheckoutAction;
        if (!record.synced) results.push(record);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    source.onerror = () => reject(source.error);
    tx.oncomplete = () => db.close();
  });
}

export async function markActionSynced(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result as QueuedCheckoutAction | undefined;
      if (record) {
        record.synced = true;
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };

    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => db.close();
  });
}

export async function clearSyncedActions(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('synced');
    const req = index.openCursor(IDBKeyRange.only(true));

    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
