/**
 * Tests for migration-safety.ts script
 * Verifies detection of destructive database migrations
 */

import { execSync } from 'child_process';

// Mock execSync to control the migration diff output
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('Migration Safety Check', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit: ${code}`);
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  const runMigrationSafetyCheck = () => {
    // Clear the require cache to re-execute the script
    const scriptPath = require.resolve('../migration-safety');
    delete require.cache[scriptPath];
    
    try {
      require('../migration-safety');
    } catch (error: any) {
      // process.exit throws in our tests, extract the exit code
      if (error.message.startsWith('process.exit:')) {
        return parseInt(error.message.split(':')[1].trim(), 10);
      }
      throw error;
    }
  };

  describe('Safe migrations', () => {
    it('should pass for empty migration', () => {
      mockedExecSync.mockReturnValue('-- This is an empty migration.\n');

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No pending migrations')
      );
    });

    it('should pass for additive migration with new table', () => {
      const additiveMigration = `
        -- CreateTable
        CREATE TABLE "public"."new_feature" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY ("id")
        );
      `;
      mockedExecSync.mockReturnValue(additiveMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('additive and safe')
      );
    });

    it('should pass for additive migration with new column', () => {
      const additiveMigration = `
        -- AlterTable
        ALTER TABLE "public"."users" ADD COLUMN "phone_number" TEXT;
      `;
      mockedExecSync.mockReturnValue(additiveMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('additive and safe')
      );
    });

    it('should pass for creating indexes', () => {
      const indexMigration = `
        -- CreateIndex
        CREATE INDEX "users_email_idx" ON "public"."users"("email");
        CREATE UNIQUE INDEX "payments_transaction_hash_unique" ON "public"."payments"("transaction_hash");
      `;
      mockedExecSync.mockReturnValue(indexMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('additive and safe')
      );
    });
  });

  describe('Destructive migrations', () => {
    it('should fail for DROP TABLE', () => {
      const destructiveMigration = `
        -- DropTable
        DROP TABLE "public"."old_feature";
      `;
      mockedExecSync.mockReturnValue(destructiveMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DESTRUCTIVE MIGRATION DETECTED')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE')
      );
    });

    it('should fail for DROP COLUMN', () => {
      const destructiveMigration = `
        -- AlterTable
        ALTER TABLE "public"."users" DROP COLUMN "old_field";
      `;
      mockedExecSync.mockReturnValue(destructiveMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DESTRUCTIVE MIGRATION DETECTED')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DROP COLUMN')
      );
    });

    it('should fail for DROP TYPE (enum)', () => {
      const destructiveMigration = `
        -- DropEnum
        DROP TYPE "public"."PaymentStatus";
      `;
      mockedExecSync.mockReturnValue(destructiveMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DESTRUCTIVE MIGRATION DETECTED')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DROP TYPE')
      );
    });

    it('should fail for multiple destructive operations', () => {
      const multiDestructiveMigration = `
        -- DropTable
        DROP TABLE "public"."old_table";
        
        -- AlterTable
        ALTER TABLE "public"."users" DROP COLUMN "deprecated_field";
        
        -- DropEnum
        DROP TYPE "public"."OldStatus";
      `;
      mockedExecSync.mockReturnValue(multiDestructiveMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DESTRUCTIVE MIGRATION DETECTED')
      );
    });

    it('should fail even with mixed safe and destructive operations', () => {
      const mixedMigration = `
        -- CreateTable (safe)
        CREATE TABLE "public"."new_feature" (
          "id" TEXT NOT NULL,
          PRIMARY KEY ("id")
        );
        
        -- DropTable (destructive)
        DROP TABLE "public"."old_feature";
      `;
      mockedExecSync.mockReturnValue(mixedMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DESTRUCTIVE MIGRATION DETECTED')
      );
    });
  });

  describe('Case insensitivity', () => {
    it('should detect DROP TABLE in lowercase', () => {
      const destructiveMigration = 'drop table "public"."old_table";';
      mockedExecSync.mockReturnValue(destructiveMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(2);
    });

    it('should detect DROP COLUMN in mixed case', () => {
      const destructiveMigration = 'alter table "public"."users" Drop Column "field";';
      mockedExecSync.mockReturnValue(destructiveMigration);

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(2);
    });
  });

  describe('Error handling', () => {
    it('should exit with code 1 if prisma migrate diff fails', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to run prisma migrate diff')
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty diff output', () => {
      mockedExecSync.mockReturnValue('');

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No pending migrations')
      );
    });

    it('should handle whitespace-only diff output', () => {
      mockedExecSync.mockReturnValue('   \n  \n   ');

      const exitCode = runMigrationSafetyCheck();

      expect(exitCode).toBe(0);
    });

    it('should not flag DROP INDEX as destructive (indexes can be recreated)', () => {
      const indexDropMigration = `
        -- DropIndex
        DROP INDEX "public"."old_index_name";
      `;
      mockedExecSync.mockReturnValue(indexDropMigration);

      const exitCode = runMigrationSafetyCheck();

      // DROP INDEX should be safe (not in dataLossKeywords)
      expect(exitCode).toBe(0);
    });
  });

  describe('Manual approval guidance', () => {
    it('should mention migration-approved label in error message', () => {
      const destructiveMigration = 'DROP TABLE "public"."old_table";';
      mockedExecSync.mockReturnValue(destructiveMigration);

      runMigrationSafetyCheck();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('migration-approved')
      );
    });

    it('should mention manual approval requirement', () => {
      const destructiveMigration = 'DROP TABLE "public"."old_table";';
      mockedExecSync.mockReturnValue(destructiveMigration);

      runMigrationSafetyCheck();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Manual approval')
      );
    });

    it('should mention database backup requirement', () => {
      const destructiveMigration = 'DROP TABLE "public"."old_table";';
      mockedExecSync.mockReturnValue(destructiveMigration);

      runMigrationSafetyCheck();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('backup')
      );
    });
  });
});
