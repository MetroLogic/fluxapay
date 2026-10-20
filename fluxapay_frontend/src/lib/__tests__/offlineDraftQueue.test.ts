import {
  enqueueOfflineDraft,
  syncOfflineDrafts,
  type OfflineDraft,
  type OfflineDraftStore,
} from '../offlineDraftQueue';

function memoryStore(): OfflineDraftStore & { items: Map<string, OfflineDraft> } {
  const items = new Map<string, OfflineDraft>();
  return {
    items,
    async put(d) { items.set(d.id, { ...d }); },
    async getAll() { return [...items.values()].sort((a, b) => a.createdAt - b.createdAt); },
    async remove(id) { items.delete(id); },
  };
}

describe('offlineDraftQueue', () => {
  it('queues drafts with uuid and timestamp', async () => {
    const store = memoryStore();
    const d = await enqueueOfflineDraft('invoice', { amount: 5 }, store);
    expect(d.id).toBeTruthy();
    expect(d.createdAt).toBeGreaterThan(0);
    expect(store.items.size).toBe(1);
  });

  it('drains the queue when online', async () => {
    const store = memoryStore();
    await enqueueOfflineDraft('payment_link', { a: 1 }, store);
    await enqueueOfflineDraft('invoice', { b: 2 }, store);
    const send = jest.fn().mockResolvedValue(undefined);
    const res = await syncOfflineDrafts({ send, store, sleep: async () => {} });
    expect(res.synced).toHaveLength(2);
    expect(store.items.size).toBe(0);
  });

  it('retries and keeps failed drafts queued', async () => {
    const store = memoryStore();
    await enqueueOfflineDraft('invoice', { b: 2 }, store);
    const send = jest.fn().mockRejectedValue(new Error('boom'));
    const res = await syncOfflineDrafts({ send, store, maxAttempts: 3, sleep: async () => {} });
    expect(send).toHaveBeenCalledTimes(3);
    expect(res.failed).toHaveLength(1);
    expect(store.items.size).toBe(1);
  });
});
