import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enqueueCheckoutAction,
  getPendingActions,
  markActionSynced,
  clearSyncedActions,
} from '@/lib/idb-queue';

describe('Offline Sync Integration', () => {
  const testPaymentId = 'test-payment-123';

  beforeEach(async () => {
    // Clear any existing data before each test
    await clearSyncedActions();
  });

  afterEach(async () => {
    // Clean up after each test
    await clearSyncedActions();
  });

  it('queues write operations when offline', async () => {
    // Simulate offline write operation: create payment link
    await enqueueCheckoutAction(testPaymentId, 'retry-connection');

    // Verify operation is queued
    const pending = await getPendingActions(testPaymentId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      paymentId: testPaymentId,
      type: 'retry-connection',
      synced: false,
    });
  });

  it('retrieves pending actions for sync on reconnection', async () => {
    // Queue multiple operations
    await enqueueCheckoutAction(testPaymentId, 'retry-connection');
    await enqueueCheckoutAction(testPaymentId, 'validate-payment');

    // Simulate checking pending actions on online event
    const pending = await getPendingActions(testPaymentId);
    expect(pending).toHaveLength(2);
    expect(pending.map(a => a.type)).toContain('retry-connection');
    expect(pending.map(a => a.type)).toContain('validate-payment');
  });

  it('marks actions as synced after successful sync', async () => {
    // Queue operation
    await enqueueCheckoutAction(testPaymentId, 'retry-connection');
    let pending = await getPendingActions(testPaymentId);
    const actionId = pending[0].id!;

    // Simulate successful sync
    await markActionSynced(actionId);

    // Verify synced state
    const allPending = await getPendingActions(testPaymentId);
    expect(allPending).toHaveLength(0);
  });

  it('clears synced actions from queue', async () => {
    // Queue and mark as synced
    await enqueueCheckoutAction(testPaymentId, 'retry-connection');
    let pending = await getPendingActions(testPaymentId);
    await markActionSynced(pending[0].id!);

    // Clear synced actions
    await clearSyncedActions();

    // Verify queue is clean
    const finalPending = await getPendingActions();
    expect(finalPending).toHaveLength(0);
  });

  it('handles concurrent queue operations', async () => {
    // Simulate multiple rapid offline operations (e.g., user retrying payment while offline)
    const operations = [
      enqueueCheckoutAction(testPaymentId, 'retry-connection'),
      enqueueCheckoutAction(testPaymentId, 'validate-payment'),
      enqueueCheckoutAction(testPaymentId, 'retry-connection'),
    ];

    await Promise.all(operations);

    // All should be queued
    const pending = await getPendingActions(testPaymentId);
    expect(pending).toHaveLength(3);
    expect(pending.every(a => !a.synced)).toBe(true);
  });

  it('maintains timestamp for audit trail', async () => {
    const beforeTime = Date.now();
    await enqueueCheckoutAction(testPaymentId, 'retry-connection');
    const afterTime = Date.now();

    const pending = await getPendingActions(testPaymentId);
    expect(pending[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(pending[0].timestamp).toBeLessThanOrEqual(afterTime);
  });

  it('isolates queues by payment ID', async () => {
    const paymentId1 = 'payment-1';
    const paymentId2 = 'payment-2';

    // Queue operations for different payments
    await enqueueCheckoutAction(paymentId1, 'retry-connection');
    await enqueueCheckoutAction(paymentId2, 'validate-payment');

    // Verify isolation
    const pending1 = await getPendingActions(paymentId1);
    const pending2 = await getPendingActions(paymentId2);

    expect(pending1).toHaveLength(1);
    expect(pending1[0].paymentId).toBe(paymentId1);

    expect(pending2).toHaveLength(1);
    expect(pending2[0].paymentId).toBe(paymentId2);
  });

  it('complete offline flow: offline write → queue → online sync → cleared', async () => {
    // 1. User attempts checkout while offline
    await enqueueCheckoutAction(testPaymentId, 'retry-connection');
    let queued = await getPendingActions(testPaymentId);
    expect(queued).toHaveLength(1);

    // 2. User comes back online — simulate sync handler
    const toSync = await getPendingActions(testPaymentId);
    expect(toSync).toHaveLength(1);

    // 3. Sync succeeds — mark as synced
    for (const action of toSync) {
      if (action.id) {
        await markActionSynced(action.id);
      }
    }

    // 4. Clear synced actions
    await clearSyncedActions();

    // 5. Queue is now empty
    const final = await getPendingActions(testPaymentId);
    expect(final).toHaveLength(0);
  });
});
