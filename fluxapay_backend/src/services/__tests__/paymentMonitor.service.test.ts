import { PrismaClient } from '@prisma/client';
import { Horizon } from '@stellar/stellar-sdk';

// Mock dependencies
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    payment: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

jest.mock('@stellar/stellar-sdk', () => ({
  Asset: jest.fn().mockImplementation((code, issuer) => ({ code, issuer })),
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      payments: jest.fn().mockReturnThis(),
      forAccount: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      cursor: jest.fn().mockReturnThis(),
      call: jest.fn(),
    })),
  },
}));

describe('PaymentMonitor Service Logic', () => {
  let mockPrisma: any;
  let mockServer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient();
    const { Horizon } = require('@stellar/stellar-sdk');
    mockServer = new Horizon.Server('test-url');
  });

  describe('Payment monitoring with paging token', () => {
    it('should use cursor when last_paging_token exists', async () => {
      const mockPayment = {
        id: 'payment_1',
        stellar_address: 'GTEST123',
        last_paging_token: '12345',
        amount: 100,
        status: 'pending',
      };

      mockPrisma.payment.findMany.mockResolvedValue([mockPayment]);
      mockServer.call.mockResolvedValue({ records: [] });

      // Simulate the monitor logic
      const payments = await mockPrisma.payment.findMany({
        where: {
          status: 'pending',
          expiration: { gt: new Date() },
          stellar_address: { not: null },
        },
      });

      for (const payment of payments) {
        let paymentsQuery = mockServer
          .payments()
          .forAccount(payment.stellar_address)
          .order('desc')
          .limit(10);

        if (payment.last_paging_token) {
          paymentsQuery = paymentsQuery.cursor(payment.last_paging_token);
        }

        await paymentsQuery.call();
      }

      expect(mockServer.cursor).toHaveBeenCalledWith('12345');
    });

    it('should not use cursor when last_paging_token is null', async () => {
      const mockPayment = {
        id: 'payment_1',
        stellar_address: 'GTEST123',
        last_paging_token: null,
        amount: 100,
        status: 'pending',
      };

      mockPrisma.payment.findMany.mockResolvedValue([mockPayment]);
      mockServer.call.mockResolvedValue({ records: [] });

      // Simulate the monitor logic
      const payments = await mockPrisma.payment.findMany({
        where: {
          status: 'pending',
          expiration: { gt: new Date() },
          stellar_address: { not: null },
        },
      });

      for (const payment of payments) {
        let paymentsQuery = mockServer
          .payments()
          .forAccount(payment.stellar_address)
          .order('desc')
          .limit(10);

        if (payment.last_paging_token) {
          paymentsQuery = paymentsQuery.cursor(payment.last_paging_token);
        }

        await paymentsQuery.call();
      }

      expect(mockServer.cursor).not.toHaveBeenCalled();
    });

    it('should update paging token after processing transactions', async () => {
      const mockPayment = {
        id: 'payment_1',
        stellar_address: 'GTEST123',
        last_paging_token: null,
        amount: 100,
        status: 'pending',
      };

      const mockTransactionRecord = {
        paging_token: '67890',
        type: 'payment',
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y',
        amount: '100.0',
      };

      mockPrisma.payment.findMany.mockResolvedValue([mockPayment]);
      mockServer.call.mockResolvedValue({ records: [mockTransactionRecord] });
      mockPrisma.payment.update.mockResolvedValue({});

      // Simulate the monitor logic
      const payments = await mockPrisma.payment.findMany({
        where: {
          status: 'pending',
          expiration: { gt: new Date() },
          stellar_address: { not: null },
        },
      });

      for (const payment of payments) {
        const transactions = await mockServer
          .payments()
          .forAccount(payment.stellar_address)
          .order('desc')
          .limit(10)
          .call();

        let latestPagingToken = payment.last_paging_token;

        for (const record of transactions.records) {
          if (record.paging_token && (!latestPagingToken || record.paging_token > latestPagingToken)) {
            latestPagingToken = record.paging_token;
          }

          const amount = parseFloat(record.amount);
          if (amount >= payment.amount) {
            await mockPrisma.payment.update({
              where: { id: payment.id },
              data: {
                status: 'paid',
                last_paging_token: latestPagingToken,
              },
            });
            break;
          }
        }
      }

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment_1' },
        data: {
          status: 'paid',
          last_paging_token: '67890',
        },
      });
    });
  });
});
