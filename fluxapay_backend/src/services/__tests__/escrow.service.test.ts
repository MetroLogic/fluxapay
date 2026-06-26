import {
  initializeEscrowContract,
  releaseEscrowFunds,
  refundEscrowFunds,
  processEscrowContractEvent,
} from "../escrow.service";
import { PrismaClient } from "../../generated/client/client";

const prisma = new PrismaClient();

function uniquePhone(): string {
  return `+188802${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

describe("Escrow Service", () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.payment.deleteMany({
      where: { customer_email: { contains: "test-escrow" } },
    });
    await prisma.merchant.deleteMany({
      where: {
        OR: [
          { email: { contains: "test-escrow" } },
          { phone_number: { startsWith: "+188802" } },
        ],
      },
    });
  });

  describe("initializeEscrowContract", () => {
    it("should initialize escrow contract successfully", async () => {
      // Create test merchant and payment
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Escrow Merchant",
          email: "test-escrow@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: "hashedpassword",
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const payment = await prisma.payment.create({
        data: {
          merchantId: merchant.id,
          amount: "100.00",
          currency: "USDC",
          customer_email: "test-escrow-customer@example.com",
          description: "Test payment",
          metadata: {},
          expiration: new Date(Date.now() + 3600000),
          status: "pending",
          checkout_url: "https://example.com/checkout",
        },
      });

      const result = await initializeEscrowContract({
        paymentId: payment.id,
        amount: "100.00",
        currency: "USDC",
        merchantPublicKey: "test-public-key",
      });

      expect(result).toHaveProperty("message", "Escrow contract initialized successfully");
      expect(result).toHaveProperty("contractAddress");
      expect(result.payment.escrow_mode).toBe(true);
      expect(result.payment.escrow_status).toBe("active");
    });

    it("should fail if escrow already initialized", async () => {
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Escrow Merchant",
          email: "test-escrow-2@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: "hashedpassword",
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const payment = await prisma.payment.create({
        data: {
          merchantId: merchant.id,
          amount: "100.00",
          currency: "USDC",
          customer_email: "test-escrow-customer-2@example.com",
          description: "Test payment",
          metadata: {},
          expiration: new Date(Date.now() + 3600000),
          status: "pending",
          checkout_url: "https://example.com/checkout",
          escrow_mode: true,
          escrow_status: "active",
          escrow_contract_address: "test-contract-address",
        },
      });

      await expect(
        initializeEscrowContract({
          paymentId: payment.id,
          amount: "100.00",
          currency: "USDC",
          merchantPublicKey: "test-public-key",
        })
      ).rejects.toMatchObject({
        status: 400,
        message: "Escrow already initialized for this payment",
      });
    });
  });

  describe("releaseEscrowFunds", () => {
    it("should release escrow funds successfully", async () => {
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Escrow Merchant",
          email: "test-escrow-release@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: "hashedpassword",
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const payment = await prisma.payment.create({
        data: {
          merchantId: merchant.id,
          amount: "100.00",
          currency: "USDC",
          customer_email: "test-escrow-release-customer@example.com",
          description: "Test payment",
          metadata: {},
          expiration: new Date(Date.now() + 3600000),
          status: "pending",
          checkout_url: "https://example.com/checkout",
          escrow_mode: true,
          escrow_status: "active",
          escrow_contract_address: "test-contract-address",
        },
      });

      const result = await releaseEscrowFunds({
        paymentId: payment.id,
        merchantId: merchant.id,
      });

      expect(result).toHaveProperty("message", "Escrow funds released successfully");
      expect(result.payment.escrow_status).toBe("released");
      expect(result.payment.status).toBe("completed");
    });

    it("should fail if not authorized", async () => {
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Escrow Merchant",
          email: "test-escrow-unauth@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: "hashedpassword",
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const payment = await prisma.payment.create({
        data: {
          merchantId: merchant.id,
          amount: "100.00",
          currency: "USDC",
          customer_email: "test-escrow-unauth-customer@example.com",
          description: "Test payment",
          metadata: {},
          expiration: new Date(Date.now() + 3600000),
          status: "pending",
          checkout_url: "https://example.com/checkout",
          escrow_mode: true,
          escrow_status: "active",
          escrow_contract_address: "test-contract-address",
        },
      });

      await expect(
        releaseEscrowFunds({
          paymentId: payment.id,
          merchantId: "different-merchant-id",
        })
      ).rejects.toMatchObject({
        status: 403,
        message: "Not authorized to release this escrow",
      });
    });
  });

  describe("refundEscrowFunds", () => {
    it("should refund escrow funds successfully", async () => {
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Escrow Merchant",
          email: "test-escrow-refund@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: "hashedpassword",
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const payment = await prisma.payment.create({
        data: {
          merchantId: merchant.id,
          amount: "100.00",
          currency: "USDC",
          customer_email: "test-escrow-refund-customer@example.com",
          description: "Test payment",
          metadata: {},
          expiration: new Date(Date.now() + 3600000),
          status: "pending",
          checkout_url: "https://example.com/checkout",
          escrow_mode: true,
          escrow_status: "active",
          escrow_contract_address: "test-contract-address",
        },
      });

      const result = await refundEscrowFunds({
        paymentId: payment.id,
        reason: "Customer request",
        initiatedBy: "admin",
      });

      expect(result).toHaveProperty("message", "Escrow funds refunded successfully");
      expect(result.payment.escrow_status).toBe("refunded");
      expect(result.payment.status).toBe("failed");
    });
  });

  describe("processEscrowContractEvent", () => {
    it("should process released event successfully", async () => {
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Escrow Merchant",
          email: "test-escrow-event@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: "hashedpassword",
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const payment = await prisma.payment.create({
        data: {
          merchantId: merchant.id,
          amount: "100.00",
          currency: "USDC",
          customer_email: "test-escrow-event-customer@example.com",
          description: "Test payment",
          metadata: {},
          expiration: new Date(Date.now() + 3600000),
          status: "pending",
          checkout_url: "https://example.com/checkout",
          escrow_mode: true,
          escrow_status: "active",
          escrow_contract_address: "test-contract-address-event",
        },
      });

      const result = await processEscrowContractEvent({
        contractAddress: "test-contract-address-event",
        eventType: "released",
        timestamp: new Date(),
      });

      expect(result).toHaveProperty("message", "Contract event processed successfully");
      expect(result!.payment.escrow_status).toBe("released");
    });

    it("should process refunded event successfully", async () => {
      const merchant = await prisma.merchant.create({
        data: {
          business_name: "Test Escrow Merchant",
          email: "test-escrow-event-2@example.com",
          phone_number: uniquePhone(),
          country: "US",
          settlement_currency: "USD",
          password: "hashedpassword",
          webhook_secret: "test-secret",
          status: "active",
        },
      });

      const payment = await prisma.payment.create({
        data: {
          merchantId: merchant.id,
          amount: "100.00",
          currency: "USDC",
          customer_email: "test-escrow-event-2-customer@example.com",
          description: "Test payment",
          metadata: {},
          expiration: new Date(Date.now() + 3600000),
          status: "pending",
          checkout_url: "https://example.com/checkout",
          escrow_mode: true,
          escrow_status: "active",
          escrow_contract_address: "test-contract-address-event-2",
        },
      });

      const result = await processEscrowContractEvent({
        contractAddress: "test-contract-address-event-2",
        eventType: "refunded",
        timestamp: new Date(),
      });

      expect(result).toHaveProperty("message", "Contract event processed successfully");
      expect(result!.payment.escrow_status).toBe("refunded");
    });
  });
});
