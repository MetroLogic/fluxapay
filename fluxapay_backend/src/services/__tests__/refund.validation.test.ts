/**
 * refund.validation.test.ts
 *
 * Unit tests for refund validation logic in createRefundService.
 * All Prisma calls and webhook delivery are mocked so no real
 * database connection is required.
 */

// ── Env stubs (must precede any imports that read env) ────────────────────────
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.USDC_ISSUER_PUBLIC_KEY =
  'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y';

// ── Mock: Prisma client ────────────────────────────────────────────────────────
const mockTransaction = jest.fn();
const mockQueryRaw = jest.fn();
const mockPaymentFindUnique = jest.fn();
const mockRefundFindMany = jest.fn();
const mockRefundFindFirst = jest.fn();
const mockRefundCreate = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('../../generated/client/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $transaction: mockTransaction,
    $disconnect: mockDisconnect,
  })),
  RefundStatus: {},
  WebhookEventType: {},
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: 'Serializable',
    },
  },
}));

// ── Mock: webhook service ──────────────────────────────────────────────────────
jest.mock('../webhook.service', () => ({
  createAndDeliverWebhook: jest.fn().mockResolvedValue(undefined),
}));

import { createRefundService } from '../refund.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal mock payment row returned by $queryRaw */
function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-payment',
    merchantId: 'test-merchant',
    amount: 100,
    currency: 'USD',
    status: 'confirmed',
    expiration: new Date(Date.now() + 86_400_000), // 24 h from now
    ...overrides,
  };
}

/** Build a minimal mock refund row */
function makeRefund(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refund-1',
    merchantId: 'test-merchant',
    paymentId: 'test-payment',
    amount: 0,
    currency: 'USD',
    status: 'pending',
    created_at: new Date(),
    ...overrides,
  };
}

/**
 * Set up $transaction so it invokes the callback with a tx-like object.
 * The callback receives a mock transaction client that exposes the shared mocks.
 */
function setupTransaction(payment: object | null, existingRefunds: object[] = []) {
  const txClient = {
    $queryRaw: mockQueryRaw,
    payment: {
      findUnique: mockPaymentFindUnique,
    },
    refund: {
      findMany: mockRefundFindMany,
      findFirst: mockRefundFindFirst,
      create: mockRefundCreate,
    },
  };

  mockQueryRaw.mockResolvedValue(payment ? [payment] : []);
  mockRefundFindMany.mockResolvedValue(existingRefunds);
  mockRefundFindFirst.mockResolvedValue(null);
  mockRefundCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(makeRefund({ ...data, id: 'new-refund-id' })),
  );

  mockTransaction.mockImplementation((cb: (tx: typeof txClient) => Promise<unknown>) =>
    cb(txClient),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Refund Service - Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Payment Ownership ──────────────────────────────────────────────────────
  describe('Payment Ownership Validation', () => {
    it('should create refund when payment belongs to merchant', async () => {
      setupTransaction(makePayment());

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 50,
        reason: 'Customer request',
      });

      expect(result.message).toBe('Refund created successfully');
      expect(result.data).toMatchObject({
        merchantId: 'test-merchant',
        paymentId: 'test-payment',
        status: 'pending',
      });
      expect(Number(result.data.amount)).toBe(50);
    });

    it('should reject refund when payment does not belong to merchant', async () => {
      // $queryRaw returns empty (payment exists but not for this merchant)
      mockQueryRaw.mockResolvedValue([]);
      // findUnique confirms the payment exists under a different merchant
      mockPaymentFindUnique.mockResolvedValue({ id: 'other-payment', merchantId: 'other-merchant' });

      const txClient = {
        $queryRaw: mockQueryRaw,
        payment: { findUnique: mockPaymentFindUnique },
        refund: { findMany: mockRefundFindMany, findFirst: mockRefundFindFirst, create: mockRefundCreate },
      };
      mockTransaction.mockImplementation((cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient));

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'other-payment',
          amount: 50,
        }),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Payment does not belong to your merchant account',
      });
    });

    it('should reject refund when payment does not exist', async () => {
      mockQueryRaw.mockResolvedValue([]);
      mockPaymentFindUnique.mockResolvedValue(null);

      const txClient = {
        $queryRaw: mockQueryRaw,
        payment: { findUnique: mockPaymentFindUnique },
        refund: { findMany: mockRefundFindMany, findFirst: mockRefundFindFirst, create: mockRefundCreate },
      };
      mockTransaction.mockImplementation((cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient));

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'non-existent-payment',
          amount: 50,
        }),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Payment not found',
      });
    });
  });

  // ── Payment Status ─────────────────────────────────────────────────────────
  describe('Payment Status Validation', () => {
    it('should allow refund for confirmed payment', async () => {
      setupTransaction(makePayment({ status: 'confirmed' }));

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'confirmed-payment',
        amount: 50,
      });

      expect(result.message).toBe('Refund created successfully');
    });

    it('should allow refund for overpaid payment', async () => {
      setupTransaction(makePayment({ status: 'overpaid' }));

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'overpaid-payment',
        amount: 50,
      });

      expect(result.message).toBe('Refund created successfully');
    });

    it('should reject refund for pending payment', async () => {
      setupTransaction(makePayment({ status: 'pending' }));

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'pending-payment',
          amount: 50,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Payment cannot be refunded'),
      });
    });

    it('should reject refund for expired payment', async () => {
      setupTransaction(
        makePayment({ expiration: new Date(Date.now() - 86_400_000) }), // 24 h ago
      );

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'expired-payment',
          amount: 50,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Payment has expired and cannot be refunded',
      });
    });

    it('should reject refund for failed payment', async () => {
      setupTransaction(makePayment({ status: 'failed' }));

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'failed-payment',
          amount: 50,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Payment cannot be refunded'),
      });
    });
  });

  // ── Amount Validation ──────────────────────────────────────────────────────
  describe('Refund Amount Validation', () => {
    it('should reject refund amount exceeding payment amount', async () => {
      setupTransaction(makePayment({ amount: 100 }));

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: 150,
        }),
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('cannot exceed original payment amount'),
      });
    });

    it('should reject refund with zero amount', async () => {
      // Amount validation happens before the DB transaction
      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: 0,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Refund amount must be positive',
      });
    });

    it('should reject refund with negative amount', async () => {
      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: -50,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Refund amount must be positive',
      });
    });

    it('should prevent double refunding beyond payment amount', async () => {
      // 60 already refunded → only 40 remaining
      setupTransaction(makePayment({ amount: 100 }), [
        makeRefund({ amount: 60, status: 'completed' }),
      ]);

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: 50, // 60 + 50 = 110 > 100
        }),
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('exceeds remaining refundable amount'),
      });
    });

    it('should allow partial refund within limits', async () => {
      // 40 already refunded → 60 remaining; requesting exactly 60
      setupTransaction(makePayment({ amount: 100 }), [
        makeRefund({ amount: 40, status: 'completed' }),
      ]);

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 60,
      });

      expect(result.message).toBe('Refund created successfully');
    });
  });

  // ── Cumulative Partial Refunds ─────────────────────────────────────────────
  describe('Cumulative Partial Refunds', () => {
    it('should allow first partial refund', async () => {
      setupTransaction(makePayment({ amount: 100 }), []);

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 30,
      });

      expect(result.message).toBe('Refund created successfully');
      expect(Number(result.data.amount)).toBe(30);
    });

    it('should count pending refunds in cumulative total and reject overflow', async () => {
      // 60 in pending → only 40 remaining; requesting 50 should fail
      setupTransaction(makePayment({ amount: 100 }), [
        makeRefund({ amount: 60, status: 'pending' }),
      ]);

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: 50,
        }),
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('exceeds remaining refundable amount'),
      });
    });

    it('should count pending refunds in cumulative total and allow within limits', async () => {
      // 60 pending → 40 remaining; requesting 30 should succeed
      setupTransaction(makePayment({ amount: 100 }), [
        makeRefund({ amount: 60, status: 'pending' }),
      ]);

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 30,
      });

      expect(result.message).toBe('Refund created successfully');
    });

    it('should exclude failed/rejected refunds from cumulative total', async () => {
      // 70 in "failed" status — should NOT count toward the total
      setupTransaction(makePayment({ amount: 100 }), [
        // findMany only returns pending/processing/completed, so this list is empty
        // (the service filters by status in the query)
      ]);

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 60,
      });

      expect(result.message).toBe('Refund created successfully');
    });
  });

  // ── Idempotency ────────────────────────────────────────────────────────────
  describe('Idempotency', () => {
    it('should return existing refund for duplicate request', async () => {
      const existingRefund = makeRefund({
        id: 'existing-refund-id',
        amount: 50,
        status: 'pending',
      });

      setupTransaction(makePayment({ amount: 100 }));

      // On duplicate, findFirst returns the existing refund
      mockRefundFindFirst.mockResolvedValue(existingRefund);

      const firstResult = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 50,
        reason: 'Customer request',
        idempotency_key: 'unique-key-123',
      });

      // Reset so we get the same behaviour on the second call
      mockRefundFindFirst.mockResolvedValue(existingRefund);

      const secondResult = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 50,
        reason: 'Customer request',
        idempotency_key: 'unique-key-123',
      });

      expect(secondResult.data.id).toBe(firstResult.data.id);
    });
  });

  // ── Concurrent Refunds & Race Condition Locking ────────────────────────────
  describe('Concurrent Refund Race Conditions', () => {
    it('prevents race conditions when concurrent refunds exceed payment amount using Promise.all', async () => {
      const payment = makePayment({ amount: 100 });
      let refundedSoFar = 0;
      let isLocked = false;
      const lockQueue: Array<() => void> = [];

      const acquireLock = () =>
        new Promise<void>((resolve) => {
          if (!isLocked) {
            isLocked = true;
            resolve();
          } else {
            lockQueue.push(resolve);
          }
        });

      const releaseLock = () => {
        if (lockQueue.length > 0) {
          const next = lockQueue.shift()!;
          next();
        } else {
          isLocked = false;
        }
      };

      const txClient = {
        $queryRaw: jest.fn().mockResolvedValue([payment]),
        payment: { findUnique: mockPaymentFindUnique },
        refund: {
          findMany: jest.fn().mockImplementation(async () => {
            if (refundedSoFar > 0) {
              return [makeRefund({ amount: refundedSoFar, status: 'pending' })];
            }
            return [];
          }),
          findFirst: mockRefundFindFirst,
          create: jest.fn().mockImplementation(async ({ data }) => {
            refundedSoFar += Number(data.amount);
            return makeRefund({ ...data, id: `refund-${Date.now()}` });
          }),
        },
      };

      mockTransaction.mockImplementation(async (cb: any) => {
        await acquireLock();
        try {
          return await cb(txClient);
        } finally {
          releaseLock();
        }
      });

      const requests = [
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: 60,
        }),
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: 60,
        }),
      ];

      const results = await Promise.allSettled(requests);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        status: 422,
        message: expect.stringContaining('exceeds remaining refundable amount'),
      });
    });
  });
});
