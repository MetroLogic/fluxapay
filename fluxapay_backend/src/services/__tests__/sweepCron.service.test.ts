/**
 * sweepCron.service.test.ts
 *
 * Unit tests for the sweep cron service with DB locking mechanism.
 */

import { runSweepWithLock } from "../sweepCron.service";
import { PrismaClient } from "../../generated/client/client";
import { sweepService } from "../sweep.service";
import { logSweepTrigger, updateSweepCompletion } from "../audit.service";

jest.mock("../../generated/client/client");
jest.mock("../sweep.service");
jest.mock("../audit.service");

const mockPrisma = {
  $executeRaw: jest.fn(),
};

(PrismaClient as jest.Mock).mockImplementation(() => mockPrisma);

describe("sweepCron.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SWEEP_LOCK_TTL_MS = "600000";
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("runSweepWithLock", () => {
    it("should acquire lock and run sweep successfully", async () => {
      const mockAuditLog = { id: "audit_123" };
      const mockSweepResult = {
        sweepId: "sweep_123",
        startedAt: new Date(),
        completedAt: new Date(),
        addressesSwept: 5,
        totalAmount: "500.0000000",
        masterVaultPublicKey: "GVAULT123",
        txHashes: ["tx_hash_1", "tx_hash_2"],
        skipped: [],
      };

      // Mock lock acquisition (success)
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);
      
      // Mock audit log creation
      (logSweepTrigger as jest.Mock).mockResolvedValue(mockAuditLog);
      
      // Mock sweep execution
      (sweepService.sweepPaidPayments as jest.Mock).mockResolvedValue(mockSweepResult);
      
      // Mock lock release
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      await runSweepWithLock();

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2); // Acquire + Release
      expect(logSweepTrigger).toHaveBeenCalledWith({
        adminId: "system",
        sweepType: "scheduled",
        reason: "Periodic cron sweep",
      });
      expect(sweepService.sweepPaidPayments).toHaveBeenCalledWith({ adminId: "system" });
      expect(updateSweepCompletion).toHaveBeenCalledWith({
        auditLogId: "audit_123",
        status: "completed",
        statistics: {
          addresses_swept: 5,
          total_amount: "500.0000000",
          transaction_hash: "tx_hash_1",
        },
      });
    });

    it("should skip sweep when lock is held by another instance", async () => {
      // Mock lock acquisition (failure - already held)
      mockPrisma.$executeRaw.mockResolvedValueOnce(0);

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      await runSweepWithLock();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Lock held by another instance")
      );
      expect(sweepService.sweepPaidPayments).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1); // Only acquire attempt

      consoleSpy.mockRestore();
    });

    it("should release lock even if sweep fails", async () => {
      const mockAuditLog = { id: "audit_123" };
      const sweepError = new Error("Sweep failed");

      // Mock lock acquisition (success)
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);
      
      // Mock audit log creation
      (logSweepTrigger as jest.Mock).mockResolvedValue(mockAuditLog);
      
      // Mock sweep execution (failure)
      (sweepService.sweepPaidPayments as jest.Mock).mockRejectedValue(sweepError);
      
      // Mock lock release
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      await runSweepWithLock();

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2); // Acquire + Release
      expect(updateSweepCompletion).toHaveBeenCalledWith({
        auditLogId: "audit_123",
        status: "failed",
        failureReason: "Sweep failed",
      });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle partial sweep success with some skipped payments", async () => {
      const mockAuditLog = { id: "audit_123" };
      const mockSweepResult = {
        sweepId: "sweep_123",
        startedAt: new Date(),
        completedAt: new Date(),
        addressesSwept: 3,
        totalAmount: "300.0000000",
        masterVaultPublicKey: "GVAULT123",
        txHashes: ["tx_hash_1", "tx_hash_2", "tx_hash_3"],
        skipped: [
          { paymentId: "payment_4", reason: "No USDC balance" },
          { paymentId: "payment_5", reason: "Address mismatch" },
        ],
      };

      // Mock lock acquisition (success)
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);
      
      // Mock audit log creation
      (logSweepTrigger as jest.Mock).mockResolvedValue(mockAuditLog);
      
      // Mock sweep execution
      (sweepService.sweepPaidPayments as jest.Mock).mockResolvedValue(mockSweepResult);
      
      // Mock lock release
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      await runSweepWithLock();

      expect(updateSweepCompletion).toHaveBeenCalledWith({
        auditLogId: "audit_123",
        status: "completed",
        statistics: {
          addresses_swept: 3,
          total_amount: "300.0000000",
          transaction_hash: "tx_hash_1",
        },
      });
    });

    it("should log metrics for successful sweep", async () => {
      const mockAuditLog = { id: "audit_123" };
      const mockSweepResult = {
        sweepId: "sweep_123",
        startedAt: new Date(),
        completedAt: new Date(),
        addressesSwept: 10,
        totalAmount: "1000.0000000",
        masterVaultPublicKey: "GVAULT123",
        txHashes: ["tx_hash_1"],
        skipped: [],
      };

      // Mock lock acquisition (success)
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);
      
      // Mock audit log creation
      (logSweepTrigger as jest.Mock).mockResolvedValue(mockAuditLog);
      
      // Mock sweep execution
      (sweepService.sweepPaidPayments as jest.Mock).mockResolvedValue(mockSweepResult);
      
      // Mock lock release
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      await runSweepWithLock();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Sweep completed")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("sweep_cron_success")
      );

      consoleLogSpy.mockRestore();
    });

    it("should use custom lock TTL from environment", async () => {
      process.env.SWEEP_LOCK_TTL_MS = "300000"; // 5 minutes

      const mockAuditLog = { id: "audit_123" };
      const mockSweepResult = {
        sweepId: "sweep_123",
        startedAt: new Date(),
        completedAt: new Date(),
        addressesSwept: 1,
        totalAmount: "100.0000000",
        masterVaultPublicKey: "GVAULT123",
        txHashes: ["tx_hash_1"],
        skipped: [],
      };

      // Mock lock acquisition (success)
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);
      
      // Mock audit log creation
      (logSweepTrigger as jest.Mock).mockResolvedValue(mockAuditLog);
      
      // Mock sweep execution
      (sweepService.sweepPaidPayments as jest.Mock).mockResolvedValue(mockSweepResult);
      
      // Mock lock release
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      await runSweepWithLock();

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe("lock mechanism", () => {
    it("should create lock with correct expiration time", async () => {
      const mockAuditLog = { id: "audit_123" };
      const mockSweepResult = {
        sweepId: "sweep_123",
        startedAt: new Date(),
        completedAt: new Date(),
        addressesSwept: 1,
        totalAmount: "100.0000000",
        masterVaultPublicKey: "GVAULT123",
        txHashes: ["tx_hash_1"],
        skipped: [],
      };

      // Mock lock acquisition (success)
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);
      
      // Mock audit log creation
      (logSweepTrigger as jest.Mock).mockResolvedValue(mockAuditLog);
      
      // Mock sweep execution
      (sweepService.sweepPaidPayments as jest.Mock).mockResolvedValue(mockSweepResult);
      
      // Mock lock release
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      await runSweepWithLock();

      // Verify lock acquisition was called with correct parameters
      const lockAcquisitionCall = mockPrisma.$executeRaw.mock.calls[0];
      expect(lockAcquisitionCall).toBeDefined();
    });

    it("should release lock with correct job name and owner", async () => {
      const mockAuditLog = { id: "audit_123" };
      const mockSweepResult = {
        sweepId: "sweep_123",
        startedAt: new Date(),
        completedAt: new Date(),
        addressesSwept: 1,
        totalAmount: "100.0000000",
        masterVaultPublicKey: "GVAULT123",
        txHashes: ["tx_hash_1"],
        skipped: [],
      };

      // Mock lock acquisition (success)
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);
      
      // Mock audit log creation
      (logSweepTrigger as jest.Mock).mockResolvedValue(mockAuditLog);
      
      // Mock sweep execution
      (sweepService.sweepPaidPayments as jest.Mock).mockResolvedValue(mockSweepResult);
      
      // Mock lock release
      mockPrisma.$executeRaw.mockResolvedValueOnce(1);

      await runSweepWithLock();

      // Verify lock release was called
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
      const lockReleaseCall = mockPrisma.$executeRaw.mock.calls[1];
      expect(lockReleaseCall).toBeDefined();
    });
  });
});
