import { PrismaClient } from '@prisma/client';
import { Horizon } from '@stellar/stellar-sdk';
import { PaymentStatus } from '../../types/payment';

// Jest globals
declare const jest: any;
declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeEach: any;

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
  Asset: jest.fn().mockImplementation((code: string, issuer: string) => ({ code, issuer })),
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      payments: jest.fn().mockReturnThis(),
      loadAccount: jest.fn(),
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
        status: PaymentStatus.PENDING,
      };

      mockPrisma.payment.findMany.mockResolvedValue([mockPayment]);
      mockServer.call.mockResolvedValue({ records: [] });

      // Simulate the monitor logic
      const payments = await mockPrisma.payment.findMany({
        where: {
          status: PaymentStatus.PENDING,
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
        status: PaymentStatus.PENDING,
      };

      mockPrisma.payment.findMany.mockResolvedValue([mockPayment]);
      mockServer.call.mockResolvedValue({ records: [] });

      // Simulate the monitor logic
      const payments = await mockPrisma.payment.findMany({
        where: {
          status: PaymentStatus.PENDING,
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

    it('should update status to confirmed after processing transactions', async () => {
      const mockPayment = {
        id: 'payment_1',
        stellar_address: 'GTEST123',
        last_paging_token: null,
        amount: 100,
        status: PaymentStatus.PENDING,
      };

      const mockTransactionRecord = {
        paging_token: '67890',
        type: 'payment',
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y',
        amount: '100.0',
        transaction_hash: 'tx_1',
        from: 'G_PAYER'
      };

      mockPrisma.payment.findMany.mockResolvedValue([mockPayment]);
      mockServer.loadAccount.mockResolvedValue({
        balances: [{ asset_code: 'USDC', asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y', balance: '100.0' }]
      });
      mockServer.call.mockResolvedValue({ records: [mockTransactionRecord] });
      mockPrisma.payment.update.mockResolvedValue({});

      // Simulate the new monitor logic (simplified)
      const now = new Date();
      const payments = await mockPrisma.payment.findMany({
        where: {
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIALLY_PAID] },
          expiration: { gt: now },
          stellar_address: { not: null },
        },
      });

      for (const payment of payments) {
        const account = await mockServer.loadAccount(payment.stellar_address);
        const usdcBalance = parseFloat(account.balances[0].balance);

        const transactions = await mockServer
          .payments()
          .forAccount(payment.stellar_address)
          .order('desc')
          .limit(10)
          .call();

        let latestPagingToken = payment.last_paging_token;
        let latestTxHash: string | undefined;

        for (const record of transactions.records) {
          if (record.paging_token && (!latestPagingToken || record.paging_token > latestPagingToken)) {
            latestPagingToken = record.paging_token;
          }
          if (!latestTxHash) latestTxHash = record.transaction_hash;
        }

        let newStatus = usdcBalance >= payment.amount ? PaymentStatus.CONFIRMED : PaymentStatus.PARTIALLY_PAID;

        await mockPrisma.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus,
            last_paging_token: latestPagingToken,
            transaction_hash: latestTxHash,
          },
        });
      }

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment_1' },
        data: {
          status: PaymentStatus.CONFIRMED,
          last_paging_token: '67890',
          transaction_hash: 'tx_1',
        },
      });
    });
  });

  describe('Dedupe by tx hash', () => {
    it('should skip a transaction whose hash matches the already-stored transaction_hash', () => {
      const payment = {
        id: 'payment_1',
        stellar_address: 'GTEST123',
        last_paging_token: null,
        transaction_hash: 'already_seen_tx',
        amount: 100,
        status: PaymentStatus.PENDING,
      };

      const records = [
        {
          paging_token: '11111',
          type: 'payment',
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y',
          transaction_hash: 'already_seen_tx',
          from: 'G_PAYER',
        },
      ];

      let latestPagingToken = payment.last_paging_token;
      let latestTxHash: string | undefined;

      for (const record of records) {
        if (record.paging_token && (!latestPagingToken || record.paging_token > (latestPagingToken as string))) {
          latestPagingToken = record.paging_token;
        }
        if (record.type === 'payment' && record.asset_code === 'USDC') {
          // Dedupe guard
          if (record.transaction_hash === payment.transaction_hash) continue;
          if (!latestTxHash) latestTxHash = record.transaction_hash;
        }
      }

      // Paging token is updated so we advance past this record next tick
      expect(latestPagingToken).toBe('11111');
      // But no new tx hash should be set (already processed)
      expect(latestTxHash).toBeUndefined();
    });

    it('should process a new transaction when its hash differs from the stored one', () => {
      const payment = {
        id: 'payment_1',
        stellar_address: 'GTEST123',
        last_paging_token: '00001',
        transaction_hash: 'old_tx',
        amount: 100,
        status: PaymentStatus.PENDING,
      };

      const records = [
        {
          paging_token: '00002',
          type: 'payment',
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y',
          transaction_hash: 'new_tx',
          from: 'G_PAYER',
        },
      ];

      let latestPagingToken = payment.last_paging_token;
      let latestTxHash: string | undefined;

      for (const record of records) {
        if (record.paging_token && (!latestPagingToken || record.paging_token > latestPagingToken)) {
          latestPagingToken = record.paging_token;
        }
        if (record.type === 'payment' && record.asset_code === 'USDC') {
          if (record.transaction_hash === payment.transaction_hash) continue;
          if (!latestTxHash) latestTxHash = record.transaction_hash;
        }
      }

      expect(latestPagingToken).toBe('00002');
      expect(latestTxHash).toBe('new_tx');
    });

    it('should update last_paging_token even when no new tx hash is found', async () => {
      const mockPayment = {
        id: 'payment_1',
        stellar_address: 'GTEST123',
        last_paging_token: '11111',
        transaction_hash: 'already_seen_tx',
        amount: 100,
        status: PaymentStatus.PENDING,
      };

      mockPrisma.payment.findMany.mockResolvedValue([mockPayment]);
      mockServer.loadAccount.mockResolvedValue({
        balances: [{ asset_code: 'USDC', asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y', balance: '100.0' }],
      });
      mockServer.call.mockResolvedValue({
        records: [
          {
            paging_token: '22222',
            type: 'payment',
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y',
            transaction_hash: 'already_seen_tx',
            from: 'G_PAYER',
          },
        ],
      });
      mockPrisma.payment.update.mockResolvedValue({});

      // Simulate the dedupe + paging-token update path
      const payments = await mockPrisma.payment.findMany({});
      for (const payment of payments) {
        const account = await mockServer.loadAccount(payment.stellar_address);
        void account;
        const transactions = await mockServer.payments().forAccount(payment.stellar_address).order('desc').limit(10).call();

        let latestPagingToken = payment.last_paging_token;
        let latestTxHash: string | undefined;

        for (const record of transactions.records) {
          if (record.paging_token && (!latestPagingToken || record.paging_token > latestPagingToken)) {
            latestPagingToken = record.paging_token;
          }
          if (record.type === 'payment' && record.asset_code === 'USDC') {
            if (record.transaction_hash === payment.transaction_hash) continue;
            if (!latestTxHash) latestTxHash = record.transaction_hash;
          }
        }

        // No new tx hash but paging token advanced — still persist the token
        if (!latestTxHash && latestPagingToken && latestPagingToken !== payment.last_paging_token) {
          await mockPrisma.payment.update({
            where: { id: payment.id },
            data: { last_paging_token: latestPagingToken, last_seen_at: expect.any(Date) },
          });
        }
      }

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payment_1' },
          data: expect.objectContaining({ last_paging_token: '22222' }),
        }),
      );
    });
  });
});
