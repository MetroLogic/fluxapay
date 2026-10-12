/**
 * paymentMonitor.service.test.ts
 *
 * @deprecated The payment monitor is now a no-op stub.
 * All on-chain Stellar payment detection has moved to paymentOracle.service.ts.
 *
 * This test suite verifies only that the stub lifecycle functions exist and do
 * not throw, ensuring backwards-compatible imports in index.ts, shutdown.service.ts,
 * and paymentMonitor.worker.ts continue to compile and run without errors.
 *
 * For Oracle-level polling, paging-token, and deduplication tests see:
 *   src/__tests__/services/paymentOracle.service.test.ts
 */

jest.mock('../../utils/logger', () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import {
  runPaymentMonitorTick,
  startPaymentMonitor,
  stopPaymentMonitor,
} from '../../services/paymentMonitor.service';

describe('PaymentMonitor Service (deprecated no-op stubs)', () => {
  it('runPaymentMonitorTick resolves without error and does nothing', async () => {
    await expect(runPaymentMonitorTick()).resolves.toBeUndefined();
  });

  it('startPaymentMonitor does not throw', () => {
    expect(() => startPaymentMonitor()).not.toThrow();
  });

  it('stopPaymentMonitor does not throw', () => {
    expect(() => stopPaymentMonitor()).not.toThrow();
  });

  it('calling start then stop does not throw', () => {
    expect(() => {
      startPaymentMonitor();
      stopPaymentMonitor();
    }).not.toThrow();
  });

  it('calling stop without start does not throw', () => {
    expect(() => stopPaymentMonitor()).not.toThrow();
  });
});
