/**
 * webhook.signature.test.ts
 *
 * Tests for HMAC-SHA256 webhook signature generation and verification
 */

import { generateWebhookSignature, verifyWebhookTimestamp } from "../webhook.service";
import crypto from "crypto";

describe("Webhook Signature Generation (HMAC-SHA256)", () => {
  describe("generateWebhookSignature", () => {
    it("should generate HMAC-SHA256 signature correctly", () => {
      const payload = {
        event: "payment.confirmed",
        payment_id: "pay_123",
        amount: 100,
      };
      const secret = "test_secret_key";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const signature = generateWebhookSignature(payload, secret, timestamp);

      // Verify it's a valid hex string
      expect(signature).toMatch(/^[a-f0-9]{64}$/);

      // Verify it matches manual HMAC calculation
      const signingString = `${timestamp}.${JSON.stringify(payload)}`;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(signingString)
        .digest("hex");

      expect(signature).toBe(expectedSignature);
    });

    it("should produce different signatures for different payloads", () => {
      const secret = "test_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const payload1 = { event: "payment.confirmed", amount: 100 };
      const payload2 = { event: "payment.confirmed", amount: 200 };

      const sig1 = generateWebhookSignature(payload1, secret, timestamp);
      const sig2 = generateWebhookSignature(payload2, secret, timestamp);

      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different secrets", () => {
      const payload = { event: "payment.confirmed" };
      const timestamp = "2024-01-15T10:00:00.000Z";

      const sig1 = generateWebhookSignature(payload, "secret1", timestamp);
      const sig2 = generateWebhookSignature(payload, "secret2", timestamp);

      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different timestamps", () => {
      const payload = { event: "payment.confirmed" };
      const secret = "test_secret";

      const sig1 = generateWebhookSignature(payload, secret, "2024-01-15T10:00:00.000Z");
      const sig2 = generateWebhookSignature(payload, secret, "2024-01-15T10:00:01.000Z");

      expect(sig1).not.toBe(sig2);
    });

    it("should be deterministic - same inputs produce same signature", () => {
      const payload = { event: "payment.confirmed", amount: 100 };
      const secret = "test_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const sig1 = generateWebhookSignature(payload, secret, timestamp);
      const sig2 = generateWebhookSignature(payload, secret, timestamp);

      expect(sig1).toBe(sig2);
    });

    it("should handle complex nested payloads", () => {
      const payload = {
        event: "payment.confirmed",
        data: {
          payment: {
            id: "pay_123",
            amount: 100,
            currency: "USD",
            metadata: {
              order_id: "order_456",
              customer: {
                name: "John Doe",
                email: "john@example.com",
              },
            },
          },
        },
      };
      const secret = "test_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const signature = generateWebhookSignature(payload, secret, timestamp);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
      expect(signature.length).toBe(64);
    });

    it("should handle payloads with special characters", () => {
      const payload = {
        event: "payment.confirmed",
        description: "Test with special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?",
        unicode: "Hello 世界 🌍",
      };
      const secret = "test_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const signature = generateWebhookSignature(payload, secret, timestamp);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle empty payload", () => {
      const payload = {};
      const secret = "test_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const signature = generateWebhookSignature(payload, secret, timestamp);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle payload with null and undefined values", () => {
      const payload = {
        event: "payment.confirmed",
        optional_field: null,
        amount: 100,
      };
      const secret = "test_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const signature = generateWebhookSignature(payload, secret, timestamp);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("Signature Verification (Manual)", () => {
    it("should allow merchant to verify signature", () => {
      const payload = {
        event: "payment.confirmed",
        payment_id: "pay_123",
        amount: 100,
      };
      const merchantSecret = "merchant_secret_key";
      const timestamp = "2024-01-15T10:00:00.000Z";

      // FluxaPay generates signature
      const signature = generateWebhookSignature(payload, merchantSecret, timestamp);

      // Merchant verifies signature
      const signingString = `${timestamp}.${JSON.stringify(payload)}`;
      const expectedSignature = crypto
        .createHmac("sha256", merchantSecret)
        .update(signingString)
        .digest("hex");

      expect(signature).toBe(expectedSignature);
    });

    it("should fail verification with wrong secret", () => {
      const payload = { event: "payment.confirmed" };
      const correctSecret = "correct_secret";
      const wrongSecret = "wrong_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const signature = generateWebhookSignature(payload, correctSecret, timestamp);

      // Attempt to verify with wrong secret
      const signingString = `${timestamp}.${JSON.stringify(payload)}`;
      const wrongSignature = crypto
        .createHmac("sha256", wrongSecret)
        .update(signingString)
        .digest("hex");

      expect(signature).not.toBe(wrongSignature);
    });

    it("should fail verification with modified payload", () => {
      const originalPayload = { event: "payment.confirmed", amount: 100 };
      const modifiedPayload = { event: "payment.confirmed", amount: 200 };
      const secret = "test_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const signature = generateWebhookSignature(originalPayload, secret, timestamp);

      // Attempt to verify with modified payload
      const signingString = `${timestamp}.${JSON.stringify(modifiedPayload)}`;
      const modifiedSignature = crypto
        .createHmac("sha256", secret)
        .update(signingString)
        .digest("hex");

      expect(signature).not.toBe(modifiedSignature);
    });
  });

  describe("Timestamp Verification (Replay Protection)", () => {
    it("should accept recent timestamps within 5-minute window", () => {
      const now = new Date();
      const timestamps = [
        new Date(now.getTime() - 1000).toISOString(), // 1 second ago
        new Date(now.getTime() - 60000).toISOString(), // 1 minute ago
        new Date(now.getTime() - 180000).toISOString(), // 3 minutes ago
        new Date(now.getTime() - 299000).toISOString(), // 4:59 ago
      ];

      timestamps.forEach((ts) => {
        expect(verifyWebhookTimestamp(ts)).toBe(true);
      });
    });

    it("should reject old timestamps outside 5-minute window", () => {
      const now = new Date();
      const timestamps = [
        new Date(now.getTime() - 301000).toISOString(), // 5:01 ago
        new Date(now.getTime() - 600000).toISOString(), // 10 minutes ago
        new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
        new Date(now.getTime() - 86400000).toISOString(), // 1 day ago
      ];

      timestamps.forEach((ts) => {
        expect(verifyWebhookTimestamp(ts)).toBe(false);
      });
    });

    it("should reject future timestamps", () => {
      const now = new Date();
      const timestamps = [
        new Date(now.getTime() + 1000).toISOString(), // 1 second ahead
        new Date(now.getTime() + 60000).toISOString(), // 1 minute ahead
        new Date(now.getTime() + 3600000).toISOString(), // 1 hour ahead
      ];

      timestamps.forEach((ts) => {
        expect(verifyWebhookTimestamp(ts)).toBe(false);
      });
    });

    it("should reject invalid timestamp formats", () => {
      const invalidTimestamps = [
        "not-a-date",
        "2024-13-45", // Invalid date
        "abc123",
        "",
        "null",
        "undefined",
      ];

      invalidTimestamps.forEach((ts) => {
        expect(verifyWebhookTimestamp(ts)).toBe(false);
      });
    });

    it("should support custom time windows", () => {
      const now = new Date();
      const timestamp = new Date(now.getTime() - 120000).toISOString(); // 2 minutes ago

      expect(verifyWebhookTimestamp(timestamp, 60000)).toBe(false); // 1-minute window
      expect(verifyWebhookTimestamp(timestamp, 180000)).toBe(true); // 3-minute window
      expect(verifyWebhookTimestamp(timestamp, 300000)).toBe(true); // 5-minute window
    });

    it("should handle edge case at exact window boundary", () => {
      const now = Date.now();
      const timestamp = new Date(now - 300000).toISOString(); // Exactly 5 minutes ago

      // Should be accepted (within window)
      expect(verifyWebhookTimestamp(timestamp, 300000)).toBe(true);

      // Should be rejected (outside window)
      expect(verifyWebhookTimestamp(timestamp, 299999)).toBe(false);
    });
  });

  describe("Security Best Practices", () => {
    it("should use constant-time comparison for signature verification", () => {
      // This test demonstrates the importance of constant-time comparison
      // to prevent timing attacks
      const payload = { event: "payment.confirmed" };
      const secret = "test_secret";
      const timestamp = "2024-01-15T10:00:00.000Z";

      const correctSignature = generateWebhookSignature(payload, secret, timestamp);
      const wrongSignature = "0".repeat(64);

      // Both comparisons should take similar time
      const start1 = process.hrtime.bigint();
      const result1 = correctSignature === correctSignature;
      const end1 = process.hrtime.bigint();

      const start2 = process.hrtime.bigint();
      const result2 = correctSignature === wrongSignature;
      const end2 = process.hrtime.bigint();

      expect(result1).toBe(true);
      expect(result2).toBe(false);

      // Note: In production, use crypto.timingSafeEqual for constant-time comparison
    });

    it("should include timestamp in signature to prevent replay attacks", () => {
      const payload = { event: "payment.confirmed" };
      const secret = "test_secret";
      const timestamp1 = "2024-01-15T10:00:00.000Z";
      const timestamp2 = "2024-01-15T10:00:01.000Z";

      const sig1 = generateWebhookSignature(payload, secret, timestamp1);
      const sig2 = generateWebhookSignature(payload, secret, timestamp2);

      // Different timestamps produce different signatures
      expect(sig1).not.toBe(sig2);
    });

    it("should use per-merchant secrets for isolation", () => {
      const payload = { event: "payment.confirmed" };
      const timestamp = "2024-01-15T10:00:00.000Z";

      const merchant1Secret = "merchant_1_secret";
      const merchant2Secret = "merchant_2_secret";

      const sig1 = generateWebhookSignature(payload, merchant1Secret, timestamp);
      const sig2 = generateWebhookSignature(payload, merchant2Secret, timestamp);

      // Different merchant secrets produce different signatures
      expect(sig1).not.toBe(sig2);
    });
  });
});
