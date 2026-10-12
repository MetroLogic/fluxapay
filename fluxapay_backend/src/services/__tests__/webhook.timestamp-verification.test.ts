import { verifyWebhookTimestamp } from "../webhook.service";
import { ErrorCode } from "../../types/errors";

process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = "300"; // 5 minutes

describe("Webhook Timestamp Verification", () => {
  describe("verifyWebhookTimestamp", () => {
    it("should accept timestamp within tolerance window", () => {
      const now = new Date();
      const timestamp = now.toISOString();

      // Should not throw
      expect(() => verifyWebhookTimestamp(timestamp)).not.toThrow();
    });

    it("should accept timestamp 1 minute in the past", () => {
      const past = new Date(Date.now() - 1 * 60 * 1000);
      const timestamp = past.toISOString();

      expect(() => verifyWebhookTimestamp(timestamp)).not.toThrow();
    });

    it("should accept timestamp 4.5 minutes in the past (within 5-minute window)", () => {
      const past = new Date(Date.now() - 4.5 * 60 * 1000);
      const timestamp = past.toISOString();

      expect(() => verifyWebhookTimestamp(timestamp)).not.toThrow();
    });

    it("should accept timestamp 1 minute in the future", () => {
      const future = new Date(Date.now() + 1 * 60 * 1000);
      const timestamp = future.toISOString();

      expect(() => verifyWebhookTimestamp(timestamp)).not.toThrow();
    });

    it("should reject timestamp 6 minutes in the past (outside 5-minute window)", () => {
      const past = new Date(Date.now() - 6 * 60 * 1000);
      const timestamp = past.toISOString();

      try {
        verifyWebhookTimestamp(timestamp);
        fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe(ErrorCode.WEBHOOK_TIMESTAMP_OUTSIDE_TOLERANCE);
      }
    });

    it("should reject timestamp 6 minutes in the future (outside 5-minute window)", () => {
      const future = new Date(Date.now() + 6 * 60 * 1000);
      const timestamp = future.toISOString();

      try {
        verifyWebhookTimestamp(timestamp);
        fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe(ErrorCode.WEBHOOK_TIMESTAMP_OUTSIDE_TOLERANCE);
      }
    });

    it("should reject invalid timestamp format", () => {
      const invalidTimestamp = "not-a-valid-timestamp";

      try {
        verifyWebhookTimestamp(invalidTimestamp);
        fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe(ErrorCode.INVALID_WEBHOOK_TIMESTAMP);
      }
    });

    it("should reject malformed ISO timestamp", () => {
      const malformed = "2025-13-45T99:99:99Z"; // Invalid date

      try {
        verifyWebhookTimestamp(malformed);
        fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
      }
    });

    it("should support custom tolerance window", () => {
      const past = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const timestamp = past.toISOString();

      // With 1-minute tolerance, this should fail
      try {
        verifyWebhookTimestamp(timestamp, 60); // 1 minute tolerance
        fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe(ErrorCode.WEBHOOK_TIMESTAMP_OUTSIDE_TOLERANCE);
      }
    });

    it("should respect WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS environment variable", () => {
      const originalEnv = process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
      process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = "60"; // 1 minute

      const past = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const timestamp = past.toISOString();

      try {
        verifyWebhookTimestamp(timestamp);
        fail("Should have thrown an error with 1-minute tolerance");
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
      }

      // Restore
      process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = originalEnv;
    });

    it("should protect against timestamp that's exactly at tolerance boundary", () => {
      const boundaryPast = new Date(Date.now() - 5 * 60 * 1000); // Exactly 5 minutes
      const timestamp = boundaryPast.toISOString();

      // Should accept at exact boundary
      expect(() => verifyWebhookTimestamp(timestamp)).not.toThrow();

      const beyond = new Date(Date.now() - 5 * 60 * 1000 - 1); // 1ms beyond
      const beyondTimestamp = beyond.toISOString();

      // Should reject just beyond boundary
      try {
        verifyWebhookTimestamp(beyondTimestamp);
        fail("Should reject timestamp beyond tolerance");
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
      }
    });

    it("should protect against replay attack scenario", () => {
      // Simulate a webhook intercepted 7 minutes ago
      const interceptedAt = new Date(Date.now() - 7 * 60 * 1000);
      const timestamp = interceptedAt.toISOString();

      // Attacker tries to replay it now (7 minutes later)
      try {
        verifyWebhookTimestamp(timestamp);
        fail("Should reject replayed webhook from 7 minutes ago");
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe(ErrorCode.WEBHOOK_TIMESTAMP_OUTSIDE_TOLERANCE);
      }
    });
  });
});
