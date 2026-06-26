-- AlterEnum: Add database backup lifecycle action types
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'db_backup_started';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'db_backup_success';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'db_backup_failed';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'db_backup_retention_purge';

-- AlterEnum: Add database_backup entity type
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'database_backup';
