/**
 * redisLock.util.test.ts
 *
 * Unit tests for the distributed Redis lock utility.
 * Tests lock acquisition, release, and concurrent execution prevention.
 */

jest.mock("../redisIdempotency.middleware", () => ({
  redisClient: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

import { acquireCronLock, releaseCronLock } from "../redisLock.util";
import { redisClient } from "../redisIdempotency.middleware";

describe("redisLock.util", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("acquireCronLock", () => {
    it("should acquire lock successfully when key does not exist", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue("OK");

      const result = await acquireCronLock("test_job");

      expect(result).toBe(true);
      expect(redisClient.set).toHaveBeenCalledWith(
        "cron:lock:test_job",
        expect.any(String),
        "EX",
        300,
        "NX"
      );
    });

    it("should fail to acquire lock when key already exists", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue(null);

      const result = await acquireCronLock("test_job");

      expect(result).toBe(false);
    });

    it("should use custom TTL when provided", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue("OK");

      await acquireCronLock("test_job", { ttlSeconds: 600 });

      expect(redisClient.set).toHaveBeenCalledWith(
        "cron:lock:test_job",
        expect.any(String),
        "EX",
        600,
        "NX"
      );
    });

    it("should use custom lock owner when provided", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue("OK");

      const customOwner = "custom_owner_id";
      await acquireCronLock("test_job", { lockOwner: customOwner });

      expect(redisClient.set).toHaveBeenCalledWith(
        "cron:lock:test_job",
        customOwner,
        "EX",
        300,
        "NX"
      );
    });

    it("should return false and log warning on Redis error", async () => {
      const redisError = new Error("Redis connection failed");
      (redisClient.set as jest.Mock).mockRejectedValue(redisError);

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = await acquireCronLock("test_job");

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to acquire lock")
      );

      consoleSpy.mockRestore();
    });

    it("should use default TTL of 300 seconds when not specified", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue("OK");

      await acquireCronLock("test_job");

      const callArgs = (redisClient.set as jest.Mock).mock.calls[0];
      expect(callArgs[3]).toBe(300); // TTL argument
    });
  });

  describe("releaseCronLock", () => {
    it("should release lock when owned by same instance", async () => {
      const lockOwner = "test_owner";
      (redisClient.get as jest.Mock).mockResolvedValue(lockOwner);
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      await releaseCronLock("test_job", { lockOwner });

      expect(redisClient.get).toHaveBeenCalledWith("cron:lock:test_job");
      expect(redisClient.del).toHaveBeenCalledWith("cron:lock:test_job");
    });

    it("should not release lock when owned by different instance", async () => {
      const lockOwner = "current_owner";
      const otherOwner = "other_owner";
      (redisClient.get as jest.Mock).mockResolvedValue(otherOwner);

      await releaseCronLock("test_job", { lockOwner });

      expect(redisClient.get).toHaveBeenCalledWith("cron:lock:test_job");
      expect(redisClient.del).not.toHaveBeenCalled();
    });

    it("should handle case when lock key does not exist", async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      await releaseCronLock("test_job");

      expect(redisClient.get).toHaveBeenCalledWith("cron:lock:test_job");
      expect(redisClient.del).not.toHaveBeenCalled();
    });

    it("should log warning on Redis error during release", async () => {
      const redisError = new Error("Redis connection failed");
      (redisClient.get as jest.Mock).mockRejectedValue(redisError);

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      await releaseCronLock("test_job");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to release lock")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("distributed lock prevention", () => {
    it("should prevent two concurrent job executions", async () => {
      // First instance acquires lock
      (redisClient.set as jest.Mock).mockResolvedValueOnce("OK");
      const lock1 = await acquireCronLock("payment_expiry");

      // Second instance tries to acquire same lock
      (redisClient.set as jest.Mock).mockResolvedValueOnce(null);
      const lock2 = await acquireCronLock("payment_expiry");

      expect(lock1).toBe(true); // First instance succeeds
      expect(lock2).toBe(false); // Second instance fails
    });

    it("should allow sequential execution with lock release", async () => {
      // First instance acquires lock
      (redisClient.set as jest.Mock).mockResolvedValueOnce("OK");
      const lock1 = await acquireCronLock("settlement", { lockOwner: "instance_1" });

      // First instance releases lock
      (redisClient.get as jest.Mock).mockResolvedValueOnce("instance_1");
      (redisClient.del as jest.Mock).mockResolvedValueOnce(1);
      await releaseCronLock("settlement", { lockOwner: "instance_1" });

      // Second instance can now acquire lock
      (redisClient.set as jest.Mock).mockResolvedValueOnce("OK");
      const lock2 = await acquireCronLock("settlement", { lockOwner: "instance_2" });

      expect(lock1).toBe(true);
      expect(lock2).toBe(true);
    });

    it("should allow same job to run on different instances if different job names", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue("OK");

      const billing = await acquireCronLock("billing");
      const settlement = await acquireCronLock("settlement");
      const checkout = await acquireCronLock("checkout_reminder");

      expect(billing).toBe(true);
      expect(settlement).toBe(true);
      expect(checkout).toBe(true);
      expect(redisClient.set).toHaveBeenCalledTimes(3);
    });
  });

  describe("lock key naming", () => {
    it("should use correct Redis key format with job name", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue("OK");

      await acquireCronLock("invoice_overdue");

      expect(redisClient.set).toHaveBeenCalledWith(
        "cron:lock:invoice_overdue",
        expect.any(String),
        "EX",
        300,
        "NX"
      );
    });

    it("should use same key for release as acquisition", async () => {
      const jobName = "idempotency_cleanup";
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      await releaseCronLock(jobName);

      expect(redisClient.get).toHaveBeenCalledWith(`cron:lock:${jobName}`);
    });
  });

  describe("TTL and expiration", () => {
    it("should set correct TTL for lock expiration on crash", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue("OK");

      const customTTL = 600;
      await acquireCronLock("db_backup", { ttlSeconds: customTTL });

      const callArgs = (redisClient.set as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toBe("EX"); // Expiration flag
      expect(callArgs[3]).toBe(customTTL); // TTL value
    });

    it("should handle TTL longer than default", async () => {
      (redisClient.set as jest.Mock).mockResolvedValue("OK");

      const longTTL = 3600; // 1 hour
      await acquireCronLock("address_pool", { ttlSeconds: longTTL });

      const callArgs = (redisClient.set as jest.Mock).mock.calls[0];
      expect(callArgs[3]).toBe(longTTL);
    });
  });
});
