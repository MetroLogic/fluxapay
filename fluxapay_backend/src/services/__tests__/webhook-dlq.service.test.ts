import { prisma } from "../../config/prisma";
import {
  moveWebhookToDLQ,
  listWebhookDLQ,
  replayWebhookFromDLQ,
  deleteWebhookFromDLQ,
  cleanupExpiredDLQItems,
} from "../webhook-dlq.service";

describe("Webhook DLQ Service", () => {
  const merchantId = "test-merchant-id";
  const webhookLogId = "test-webhook-log-id";

  // Mock webhook log
  beforeAll(async () => {
    // Create test merchant
    await prisma.merchant.upsert({
      where: { email: "dlq-test@example.com" },
      update: {},
      create: {
        id: merchantId,
        business_name: "DLQ Test Merchant",
        email: "dlq-test@example.com",
        phone_number: "+1234567890",
        country: "US",
        settlement_currency: "USD",
        webhook_secret: "test-secret",
        password: "test-password",
      },
    });

    // Create test webhook log
    await prisma.webhookLog.upsert({
      where: { id: webhookLogId },
      update: {},
      create: {
        id: webhookLogId,
        merchantId,
        event_type: "payment.confirmed",
        endpoint_url: "https://example.com/webhook",
        status: "failed",
        failure_reason: "Connection timeout",
        max_retries: 5,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.webhookDeadLetterQueue.deleteMany({
      where: { merchantId },
    });
    await prisma.webhookLog.deleteMany({
      where: { merchantId },
    });
    await prisma.merchant.delete({
      where: { id: merchantId },
    });
  });

  describe("moveWebhookToDLQ", () => {
    it("should create a DLQ item with 30-day expiry", async () => {
      const dlqItem = await moveWebhookToDLQ({
        webhookLogId,
        merchantId,
        event_type: "payment.confirmed",
        endpoint_url: "https://example.com/webhook",
        failure_reason: "Connection timeout",
        last_http_status: 0,
      });

      expect(dlqItem).toBeDefined();
      expect(dlqItem.webhookLogId).toBe(webhookLogId);
      expect(dlqItem.failure_reason).toBe("Connection timeout");

      // Check expiry is ~30 days from now
      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const diff = Math.abs(dlqItem.expires_at.getTime() - expectedExpiry.getTime());
      expect(diff).toBeLessThan(1000); // Within 1 second
    });

    it("should not allow duplicate DLQ items for same webhook", async () => {
      const webhookLogId2 = "test-webhook-log-id-2";

      // Create another test log
      await prisma.webhookLog.create({
        data: {
          id: webhookLogId2,
          merchantId,
          event_type: "payment.failed",
          endpoint_url: "https://example.com/webhook2",
          status: "failed",
          max_retries: 5,
        },
      });

      // Move to DLQ
      await moveWebhookToDLQ({
        webhookLogId: webhookLogId2,
        merchantId,
        event_type: "payment.failed",
        endpoint_url: "https://example.com/webhook2",
        failure_reason: "Connection refused",
      });

      // Try to move again — should fail with unique constraint
      await expect(
        moveWebhookToDLQ({
          webhookLogId: webhookLogId2,
          merchantId,
          event_type: "payment.failed",
          endpoint_url: "https://example.com/webhook2",
          failure_reason: "Connection refused",
        })
      ).rejects.toThrow();

      // Cleanup
      await prisma.webhookDeadLetterQueue.deleteMany({
        where: { webhookLogId: webhookLogId2 },
      });
      await prisma.webhookLog.delete({
        where: { id: webhookLogId2 },
      });
    });
  });

  describe("listWebhookDLQ", () => {
    it("should list DLQ items for a merchant", async () => {
      const result = await listWebhookDLQ({
        merchantId,
        page: 1,
        limit: 10,
      });

      expect(result.items).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
      expect(result.page).toBe(1);
    });

    it("should support pagination", async () => {
      const result1 = await listWebhookDLQ({
        merchantId,
        page: 1,
        limit: 1,
      });

      const result2 = await listWebhookDLQ({
        merchantId,
        page: 2,
        limit: 1,
      });

      expect(result1.items[0].id).not.toBe(result2.items[0]?.id);
    });
  });

  describe("replayWebhookFromDLQ", () => {
    it("should reset webhook status for retry", async () => {
      const dlqItem = await moveWebhookToDLQ({
        webhookLogId: "replay-test-webhook",
        merchantId,
        event_type: "payment.confirmed",
        endpoint_url: "https://example.com/webhook",
        failure_reason: "Connection timeout",
      });

      // Create the webhook log
      await prisma.webhookLog.create({
        data: {
          id: "replay-test-webhook",
          merchantId,
          event_type: "payment.confirmed",
          endpoint_url: "https://example.com/webhook",
          status: "failed",
          max_retries: 5,
          failed_at: new Date(),
        },
      });

      await replayWebhookFromDLQ(dlqItem.id, merchantId);

      const updatedLog = await prisma.webhookLog.findUnique({
        where: { id: "replay-test-webhook" },
      });

      expect(updatedLog?.status).toBe("retrying");
      expect(updatedLog?.retry_count).toBe(0);
      expect(updatedLog?.failed_at).toBeNull();

      // Cleanup
      await prisma.webhookDeadLetterQueue.delete({
        where: { id: dlqItem.id },
      });
      await prisma.webhookLog.delete({
        where: { id: "replay-test-webhook" },
      });
    });

    it("should throw error for invalid merchant", async () => {
      const dlqItem = await moveWebhookToDLQ({
        webhookLogId: "auth-test-webhook",
        merchantId,
        event_type: "payment.confirmed",
        endpoint_url: "https://example.com/webhook",
        failure_reason: "Connection timeout",
      });

      // Create the webhook log
      await prisma.webhookLog.create({
        data: {
          id: "auth-test-webhook",
          merchantId,
          event_type: "payment.confirmed",
          endpoint_url: "https://example.com/webhook",
          status: "failed",
          max_retries: 5,
        },
      });

      await expect(
        replayWebhookFromDLQ(dlqItem.id, "wrong-merchant-id")
      ).rejects.toThrow("Unauthorized");

      // Cleanup
      await prisma.webhookDeadLetterQueue.delete({
        where: { id: dlqItem.id },
      });
      await prisma.webhookLog.delete({
        where: { id: "auth-test-webhook" },
      });
    });
  });

  describe("deleteWebhookFromDLQ", () => {
    it("should delete a DLQ item", async () => {
      const dlqItem = await moveWebhookToDLQ({
        webhookLogId: "delete-test-webhook",
        merchantId,
        event_type: "payment.confirmed",
        endpoint_url: "https://example.com/webhook",
        failure_reason: "Connection timeout",
      });

      // Create the webhook log
      await prisma.webhookLog.create({
        data: {
          id: "delete-test-webhook",
          merchantId,
          event_type: "payment.confirmed",
          endpoint_url: "https://example.com/webhook",
          status: "failed",
          max_retries: 5,
        },
      });

      await deleteWebhookFromDLQ(dlqItem.id, merchantId);

      const deleted = await prisma.webhookDeadLetterQueue.findUnique({
        where: { id: dlqItem.id },
      });

      expect(deleted).toBeNull();

      // Cleanup
      await prisma.webhookLog.delete({
        where: { id: "delete-test-webhook" },
      });
    });
  });

  describe("cleanupExpiredDLQItems", () => {
    it("should delete expired items", async () => {
      // Create an expired item
      const expiredDlqItem = await prisma.webhookDeadLetterQueue.create({
        data: {
          id: "expired-dlq-item",
          webhookLogId: "expired-webhook",
          merchantId,
          event_type: "payment.confirmed",
          endpoint_url: "https://example.com/webhook",
          failure_reason: "Connection timeout",
          expires_at: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      // Create the webhook log
      await prisma.webhookLog.create({
        data: {
          id: "expired-webhook",
          merchantId,
          event_type: "payment.confirmed",
          endpoint_url: "https://example.com/webhook",
          status: "failed",
          max_retries: 5,
        },
      });

      const deletedCount = await cleanupExpiredDLQItems();

      expect(deletedCount).toBeGreaterThanOrEqual(1);

      const found = await prisma.webhookDeadLetterQueue.findUnique({
        where: { id: "expired-dlq-item" },
      });

      expect(found).toBeNull();

      // Cleanup
      await prisma.webhookLog.delete({
        where: { id: "expired-webhook" },
      });
    });
  });
});
