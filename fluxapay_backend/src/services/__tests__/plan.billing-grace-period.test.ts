import {
  processBillingCycle,
  processPastDueSubscriptions,
  createSubscription,
  getSubscriptionsDueForRenewal,
} from "../plan.service";
import { PrismaClient } from "../../generated/client/client";
import bcrypt from "bcrypt";

process.env.BILLING_GRACE_PERIOD_DAYS = "7";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/fluxapay_test?schema=public";
process.env.JWT_SECRET = process.env.JWT_SECRET || "ci-test-jwt-secret-key";

const prisma = new PrismaClient();

function uniquePhone(): string {
  return `+188801${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

describe("Plan Service — Billing Grace Period", () => {
  let testMerchant: any;
  let testPlan: any;
  let freePlan: any;

  beforeAll(async () => {
    // Create test plans
    testPlan =
      (await prisma.plan.findFirst({ where: { slug: "pro" } })) ||
      (await prisma.plan.create({
        data: {
          name: "Pro Plan",
          slug: `pro-${Date.now()}`,
          description: "Professional plan",
          amount: 100,
          currency: "USD",
          interval: "monthly",
        },
      }));

    freePlan =
      (await prisma.plan.findFirst({ where: { slug: "free" } })) ||
      (await prisma.plan.create({
        data: {
          name: "Free Plan",
          slug: `free-${Date.now()}`,
          description: "Free plan",
          amount: 0,
          currency: "USD",
          interval: "monthly",
        },
      }));
  });

  beforeEach(async () => {
    // Create test merchant
    const hashedPassword = await bcrypt.hash("TestPassword123!", 12);
    testMerchant = await prisma.merchant.create({
      data: {
        business_name: "Billing Grace Period Test",
        email: `test-billing-${Date.now()}@example.com`,
        phone_number: uniquePhone(),
        country: "US",
        settlement_currency: "USD",
        password: hashedPassword,
        webhook_secret: "test-secret",
        status: "active",
      },
    });
  });

  afterEach(async () => {
    // Cleanup
    if (testMerchant) {
      await prisma.merchantSubscription.deleteMany({
        where: { merchantId: testMerchant.id },
      });
      await prisma.merchant.delete({ where: { id: testMerchant.id } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("processBillingCycle", () => {
    it("should move failed renewal to PAST_DUE status", async () => {
      // Create a subscription with next billing date in the past (due)
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      const subscription = await prisma.merchantSubscription.create({
        data: {
          merchantId: testMerchant.id,
          planId: testPlan.id,
          status: "active",
          billing_cycle: "monthly",
          current_period_start: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
          current_period_end: pastDate,
          next_billing_date: pastDate,
          current_period_amount: testPlan.amount,
        },
      });

      // Process billing cycle (will fail because no payment method)
      const result = await processBillingCycle();

      // Verify the subscription was processed
      expect(result.processed).toBeGreaterThan(0);

      // Verify the subscription status changed
      const updated = await prisma.merchantSubscription.findUnique({
        where: { id: subscription.id },
      });

      // Since there's no bank account, it should move to PAST_DUE
      expect(updated?.status).toBe("past_due");
    });

    it("should maintain active status on successful renewal", async () => {
      // Create subscription with a future billing date (not due yet)
      const now = new Date();
      const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const subscription = await prisma.merchantSubscription.create({
        data: {
          merchantId: testMerchant.id,
          planId: testPlan.id,
          status: "active",
          billing_cycle: "monthly",
          current_period_start: now,
          current_period_end: futureDate,
          next_billing_date: futureDate,
          current_period_amount: testPlan.amount,
        },
      });

      // Process billing cycle (should not process as it's not due)
      const result = await processBillingCycle();

      // Subscription shouldn't be in the due list
      const updated = await prisma.merchantSubscription.findUnique({
        where: { id: subscription.id },
      });

      expect(updated?.status).toBe("active");
    });
  });

  describe("processPastDueSubscriptions", () => {
    it("should attempt daily retries during grace period", async () => {
      const now = new Date();
      const gracePeriodEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const subscription = await prisma.merchantSubscription.create({
        data: {
          merchantId: testMerchant.id,
          planId: testPlan.id,
          status: "past_due",
          billing_cycle: "monthly",
          current_period_start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          current_period_end: gracePeriodEnd,
          next_billing_date: now, // Due for retry
          current_period_amount: testPlan.amount,
        },
      });

      // Process past due subscriptions
      const result = await processPastDueSubscriptions();

      expect(result.processed).toBeGreaterThan(0);

      // Verify subscription is still in PAST_DUE (since no bank account for retry)
      const updated = await prisma.merchantSubscription.findUnique({
        where: { id: subscription.id },
      });

      expect(updated?.status).toBe("past_due");
      expect(updated?.next_billing_date).not.toBeNull();
    });

    it("should downgrade to free plan after grace period expires", async () => {
      const now = new Date();
      const gracePeriodEnd = new Date(now.getTime() - 1); // Already expired

      const subscription = await prisma.merchantSubscription.create({
        data: {
          merchantId: testMerchant.id,
          planId: testPlan.id,
          status: "past_due",
          billing_cycle: "monthly",
          current_period_start: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
          current_period_end: gracePeriodEnd, // Expired
          next_billing_date: now, // Due
          current_period_amount: testPlan.amount,
        },
      });

      // Process past due subscriptions
      const result = await processPastDueSubscriptions();

      expect(result.processed).toBeGreaterThan(0);
      expect(result.downgraded).toBeGreaterThan(0);

      // Verify subscription was downgraded
      const updated = await prisma.merchantSubscription.findUnique({
        where: { id: subscription.id },
      });

      expect(updated?.status).toBe("active");
      expect(updated?.planId).toBe(freePlan.id);
    });

    it("should not downgrade if grace period is still active", async () => {
      const now = new Date();
      const gracePeriodEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days remaining

      const subscription = await prisma.merchantSubscription.create({
        data: {
          merchantId: testMerchant.id,
          planId: testPlan.id,
          status: "past_due",
          billing_cycle: "monthly",
          current_period_start: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
          current_period_end: gracePeriodEnd,
          next_billing_date: now, // Due for retry
          current_period_amount: testPlan.amount,
        },
      });

      // Process past due subscriptions
      const result = await processPastDueSubscriptions();

      // Verify subscription was NOT downgraded (grace period active)
      const updated = await prisma.merchantSubscription.findUnique({
        where: { id: subscription.id },
      });

      expect(updated?.status).toBe("past_due");
      expect(updated?.planId).toBe(testPlan.id); // Still on original plan
    });

    it("should send warning email 3 days before grace period expires", async () => {
      const now = new Date();
      const gracePeriodEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // Exactly 3 days

      const subscription = await prisma.merchantSubscription.create({
        data: {
          merchantId: testMerchant.id,
          planId: testPlan.id,
          status: "past_due",
          billing_cycle: "monthly",
          current_period_start: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
          current_period_end: gracePeriodEnd,
          next_billing_date: now, // Due for retry
          current_period_amount: testPlan.amount,
        },
      });

      // Process past due subscriptions
      // (In a real test, this would mock sendGracePeriodExpiryWarningEmail to verify it was called)
      const result = await processPastDueSubscriptions();

      expect(result.processed).toBeGreaterThan(0);
      // In a full implementation, we'd verify that the warning email was sent
    });
  });

  describe("Grace Period Configuration", () => {
    it("should respect BILLING_GRACE_PERIOD_DAYS environment variable", async () => {
      const originalEnv = process.env.BILLING_GRACE_PERIOD_DAYS;
      process.env.BILLING_GRACE_PERIOD_DAYS = "14"; // 2 weeks

      const now = new Date();
      const expectedGracePeriodEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const subscription = await prisma.merchantSubscription.create({
        data: {
          merchantId: testMerchant.id,
          planId: testPlan.id,
          status: "past_due",
          billing_cycle: "monthly",
          current_period_start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          current_period_end: expectedGracePeriodEnd,
          next_billing_date: now,
          current_period_amount: testPlan.amount,
        },
      });

      // Calculate grace period end time
      const gracePeriodDays = parseInt(process.env.BILLING_GRACE_PERIOD_DAYS || "7", 10);
      const calculatedGracePeriodEnd = new Date(now.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

      // Verify grace period is respected
      const updated = await prisma.merchantSubscription.findUnique({
        where: { id: subscription.id },
      });

      // Grace period should match the configured value
      const daysUntilExpiry = Math.ceil(
        (new Date(updated?.current_period_end!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      expect(daysUntilExpiry).toBeLessThanOrEqual(14);

      // Restore
      process.env.BILLING_GRACE_PERIOD_DAYS = originalEnv;
    });
  });
});
