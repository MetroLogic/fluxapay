/**
 * Unit tests for the merge-duplicate-customers script (#813).
 *
 * Tests the active-payment guard, --force override, and skipped-merges.json output
 * without hitting a real database.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const mockMerchantFindMany = jest.fn();
const mockCustomerFindMany = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockPaymentUpdateMany = jest.fn();
const mockPaymentLinkUpdateMany = jest.fn();
const mockCustomerUpdate = jest.fn();

jest.mock('../../../generated/client/client', () => ({
  PrismaClient: jest.fn(() => ({
    merchant: { findMany: mockMerchantFindMany },
    customer: { findMany: mockCustomerFindMany, update: mockCustomerUpdate },
    payment: { findMany: mockPaymentFindMany, updateMany: mockPaymentUpdateMany },
    paymentLink: { updateMany: mockPaymentLinkUpdateMany },
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'merchant-merge-1';

function makeCustomer(id: string, email: string, createdOffset = 0) {
  return {
    id,
    email,
    merchantId: MERCHANT_ID,
    created_at: new Date(Date.now() + createdOffset),
    name: 'Test User',
    phone: null,
    stellar_address: null,
    metadata: {},
  };
}

// Reset argv after each test so --force doesn't bleed between tests
const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  jest.clearAllMocks();
});

// ─── Dynamic import helper ────────────────────────────────────────────────────
// We re-import the module in each test so that `process.argv` changes are picked up.

async function runScript(): Promise<void> {
  jest.resetModules();

  // Re-apply mocks in the fresh module registry
  jest.mock('../../../generated/client/client', () => ({
    PrismaClient: jest.fn(() => ({
      merchant: { findMany: mockMerchantFindMany },
      customer: { findMany: mockCustomerFindMany, update: mockCustomerUpdate },
      payment: { findMany: mockPaymentFindMany, updateMany: mockPaymentUpdateMany },
      paymentLink: { updateMany: mockPaymentLinkUpdateMany },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    })),
  }));

  // We test the logic directly by extracting the `main` function.
  // Because the script calls main() at the bottom with process.exit(),
  // we isolate by calling the exported logic manually.
  // Since the script does not export `main`, we wrap it.
  const scriptPath = path.resolve(__dirname, '../../../../scripts/merge-duplicate-customers');
  // Suppress process.exit inside the script
  const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  try {
    await import(scriptPath);
    // Give the async main() a tick to finish
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    mockExit.mockRestore();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('merge-duplicate-customers script (#813)', () => {
  beforeEach(() => {
    mockMerchantFindMany.mockResolvedValue([{ id: MERCHANT_ID }]);
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    mockPaymentLinkUpdateMany.mockResolvedValue({ count: 0 });
    mockCustomerUpdate.mockResolvedValue({});
    // Default: no active payments
    mockPaymentFindMany.mockResolvedValue([]);
  });

  it('skips merge and writes skipped-merges.json when customer has active payments', async () => {
    const customerA = makeCustomer('cust-a', 'dup@example.com', 0);
    const customerB = makeCustomer('cust-b', 'dup@example.com', 1000);
    mockCustomerFindMany.mockResolvedValue([customerA, customerB]);

    // Active payment attached to customerA
    mockPaymentFindMany.mockResolvedValue([
      { id: 'pay-active-1', status: 'pending' },
    ]);

    process.argv = ['node', 'merge-duplicate-customers.ts']; // no --force

    const reportPath = path.resolve(process.cwd(), 'skipped-merges.json');
    // Ensure no leftover report
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    await runScript();

    // Merge should NOT have happened
    expect(mockCustomerUpdate).not.toHaveBeenCalled();

    // Report file should exist
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    expect(report).toHaveLength(1);
    expect(report[0].merchantId).toBe(MERCHANT_ID);
    expect(report[0].activePaymentIds).toContain('pay-active-1');

    // Cleanup
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
  });

  it('performs the merge when no active payments exist', async () => {
    const customerA = makeCustomer('cust-a', 'dup@example.com', 0);
    const customerB = makeCustomer('cust-b', 'dup@example.com', 1000);
    mockCustomerFindMany.mockResolvedValue([customerA, customerB]);

    mockPaymentFindMany.mockResolvedValue([]); // no active payments

    process.argv = ['node', 'merge-duplicate-customers.ts'];

    await runScript();

    // Payments reassigned to canonical
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: { in: ['cust-b'] } }),
        data: { customerId: 'cust-a' },
      }),
    );

    // Duplicate soft-deleted
    expect(mockCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cust-b' },
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      }),
    );
  });

  it('proceeds with merge and logs warning when --force is set, even with active payments', async () => {
    const customerA = makeCustomer('cust-a', 'force@example.com', 0);
    const customerB = makeCustomer('cust-b', 'force@example.com', 1000);
    mockCustomerFindMany.mockResolvedValue([customerA, customerB]);

    mockPaymentFindMany.mockResolvedValue([
      { id: 'pay-active-2', status: 'processing' },
    ]);

    process.argv = ['node', 'merge-duplicate-customers.ts', '--force'];

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await runScript();

    // Merge MUST have happened
    expect(mockCustomerUpdate).toHaveBeenCalled();

    // Warning was logged about active payments
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('force'),
    );

    warnSpy.mockRestore();
  });

  it('skips groups with a single customer (no duplicates)', async () => {
    mockCustomerFindMany.mockResolvedValue([
      makeCustomer('cust-only', 'unique@example.com', 0),
    ]);

    process.argv = ['node', 'merge-duplicate-customers.ts'];

    await runScript();

    expect(mockCustomerUpdate).not.toHaveBeenCalled();
    expect(mockPaymentUpdateMany).not.toHaveBeenCalled();
  });
});
