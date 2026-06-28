const mockPaymentsCall = jest.fn();
const mockTransactionCall = jest.fn();
const mockLoadAccount = jest.fn();

// Mock Horizon/Stellar SDK before other modules import it
jest.mock('@stellar/stellar-sdk', () => {
  // Set environment variables inside the hoisted mock block so they are ready before any imports run
  process.env.DATABASE_URL = 'postgresql://anchorpoint:anchorpoint@localhost:5432/fluxapay_test?schema=public';
  process.env.USDC_ISSUER_PUBLIC_KEY = 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y';
  process.env.DISABLE_STELLAR_PREPARE = 'true';
  process.env.EXCHANGE_PARTNER = 'mock';
  process.env.SMS_PROVIDER = 'mock';
  process.env.JWT_SECRET = 'test-jwt-secret-key-lifecycle';
  process.env.FUNDER_SECRET_KEY = 'SBXEHJKWF7C7BIFSUGXZE7XKFJ5SP6Y7JGPD4J4TKMX2MQXWQQRF3BSG';
  process.env.MASTER_VAULT_SECRET_KEY = 'SDGHCAPDRWTOTBAQT6HJ5KBUZOECD2JEOH6E76NDL4OXNBXIWODLZA4B';
  process.env.HD_WALLET_MASTER_SEED = 'test-legacy-master-seed-12345678';
  delete process.env.KMS_ENCRYPTED_MASTER_SEED;
  process.env.SOROBAN_VERIFICATION_ENABLED = 'false';

  const actual = jest.requireActual('@stellar/stellar-sdk');
  
  const createMockQuery = (callMock: jest.Mock) => {
    const query: any = {
      call: callMock,
    };
    const handler = {
      get(target: any, prop: string) {
        if (prop === 'call') {
          return callMock;
        }
        return () => new Proxy(query, handler);
      }
    };
    return new Proxy(query, handler);
  };

  return {
    ...actual,
    Asset: jest.fn().mockImplementation((code: string, issuer: string) => ({
      code,
      issuer,
      getCode: () => code,
      getIssuer: () => issuer,
    })),
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => {
        return {
          payments: () => createMockQuery(mockPaymentsCall),
          transactions: () => createMockQuery(mockTransactionCall),
          loadAccount: mockLoadAccount,
        };
      }),
    },
  };
});

import { PrismaClient } from '../../generated/client/client';
import { PaymentService } from '../payment.service';
import { manualVerifyPayment } from '../paymentOracle.service';
import { paymentSettlementService } from '../paymentSettlement.service';
import { eventBus, AppEvents } from '../EventService';

const prisma = new PrismaClient();

// Setup global mock for fetch (to mock webhook receiver)
const mockFetch = jest.fn().mockImplementation(() => {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve('OK'),
  });
});
global.fetch = mockFetch as any;

function uniquePhone(): string {
  return `+1${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

describe('Payment Lifecycle - End-to-End Integration Test', () => {
  const originalEnv = { ...process.env };
  const merchantId = 'lifecycle-test-merchant';

  afterAll(async () => {
    process.env = originalEnv;
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Clean up existing data for test merchant
    await prisma.settlement.deleteMany({ where: { merchantId } });
    await prisma.webhookRetryAttempt.deleteMany({ where: { webhookLog: { merchantId } } });
    await prisma.webhookLog.deleteMany({ where: { merchantId } });
    await prisma.paymentReceivedTransaction.deleteMany({ where: { payment: { merchantId } } });
    await prisma.payment.deleteMany({ where: { merchantId } });
    await prisma.bankAccount.deleteMany({ where: { merchantId } });
    await prisma.merchantHDIndex.deleteMany({ where: { merchantId } });
    await prisma.merchant.deleteMany({ where: { id: merchantId } });

    // Create a merchant with a bank account and webhook configuration
    await prisma.merchant.create({
      data: {
        id: merchantId,
        business_name: 'Lifecycle Test Merchant',
        email: 'lifecycle-test@example.com',
        phone_number: uniquePhone(),
        country: 'US',
        settlement_currency: 'USD',
        webhook_url: 'https://merchant-webhook.com/api',
        webhook_secret: 'integration-webhook-secret',
        password: 'hashed_password',
        bankAccount: {
          create: {
            account_name: 'Test Settlement Account',
            account_number: '1234567890',
            bank_name: 'Test bank',
            currency: 'USD',
            country: 'US',
          }
        }
      }
    });
  });

  it('should complete the full payment lifecycle: create charge -> detect payment -> confirm -> settle -> webhook', async () => {
    // Ensure the settlement service is initialized and listener is registered
    expect(paymentSettlementService).toBeDefined();

    // 1. Create a charge/payment
    const amount = 100;
    const payment = await PaymentService.createPayment({
      amount,
      currency: 'USD',
      customer_email: 'customer@example.com',
      merchantId,
      description: 'Integration test purchase',
    });

    expect(payment.status).toBe('pending');
    expect(payment.amount.toNumber()).toBe(amount);
    expect(payment.settled).toBe(false);
    expect(payment.stellar_address).toBeDefined();

    const stellarAddress = payment.stellar_address!;

    // 2. Mock Horizon responses for this payment's Stellar address
    mockLoadAccount.mockImplementation((addr) => {
      if (addr === stellarAddress) {
        return Promise.resolve({
          balances: [
            {
              asset_type: 'credit_alphanum4',
              asset_code: 'USDC',
              asset_issuer: process.env.USDC_ISSUER_PUBLIC_KEY,
              balance: '100.00',
            }
          ]
        });
      }
      return Promise.resolve({
        id: addr,
        sequence: '1',
        balances: [],
      });
    });

    mockPaymentsCall.mockResolvedValue({
      records: [
        {
          paging_token: '10001',
          type: 'payment',
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: process.env.USDC_ISSUER_PUBLIC_KEY,
          amount: '100.00',
          transaction_hash: 'tx_hash_lifecycle_test_123',
          from: 'G_PAYER',
          to: stellarAddress,
        }
      ]
    });

    mockTransactionCall.mockResolvedValue({
      memo_type: 'text',
      memo: payment.id,
    });

    // 3. Trigger Oracle Polling / Manual Verification
    const verification = await manualVerifyPayment(payment.id);

    expect(verification.verified).toBe(true);
    expect(verification.status).toBe('confirmed');
    expect(verification.actualAmount.toNumber()).toBe(amount);

    // Verify payment status is confirmed in database
    const confirmedPayment = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: { merchant: true }
    });
    expect(confirmedPayment?.status).toBe('confirmed');

    // 4. Emit event to trigger settlement service
    eventBus.emit(AppEvents.PAYMENT_CONFIRMED, confirmedPayment);

    // Wait for Settlement Pipeline to complete
    const settledPayment = await new Promise<any>(async (resolve, reject) => {
      for (let i = 0; i < 20; i++) {
        const p = await prisma.payment.findUnique({
          where: { id: payment.id },
          include: { settlement: true }
        });
        if (p && p.settled) {
          resolve(p);
          return;
        }
        await new Promise((res) => setTimeout(res, 100));
      }
      reject(new Error('Payment settlement timed out'));
    });

    // Verify settlement details
    expect(settledPayment.settled).toBe(true);
    expect(settledPayment.settlementId).toBeDefined();
    expect(settledPayment.settlement).toBeDefined();
    expect(settledPayment.settlement.status).toBe('completed');
    expect(settledPayment.settlement.usdc_amount.toNumber()).toBe(100);
    expect(settledPayment.settlement.net_amount.toNumber()).toBeLessThan(100); // fees deducted

    // Allow a small delay for any asynchronous tasks (like the payment.settled webhook) to finish
    await new Promise((res) => setTimeout(res, 200));

    // 5. Verify Webhook Delivery
    // We expect 2 webhook deliveries: one for payment_confirmed and one for payment_settled
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstCall = mockFetch.mock.calls[0];
    const secondCall = mockFetch.mock.calls[1];

    expect(firstCall[0]).toBe('https://merchant-webhook.com/api');
    const firstPayload = JSON.parse(firstCall[1].body);
    expect(firstPayload.payment_id).toBe(payment.id);

    expect(secondCall[0]).toBe('https://merchant-webhook.com/api');
    const secondPayload = JSON.parse(secondCall[1].body);
    expect(secondPayload.payment_id).toBe(payment.id);
  });
});
