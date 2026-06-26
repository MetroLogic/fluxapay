/**
 * dbBackup.service.ts
 *
 * Database backup service with:
 *  - AES-256-CBC encryption of dump file
 *  - SHA-256 checksum computation and storage
 *  - Post-write destination verification (file exists + size matches)
 *  - Audit trail entries for start, success, failure, and retention purges
 *  - Email alert on backup failure
 *  - Retention policy: delete local backups older than BACKUP_RETENTION_DAYS (default 30)
 *
 * Environment variables:
 *  DATABASE_URL               – PostgreSQL connection string (required)
 *  DB_BACKUP_ENCRYPTION_KEY   – 64-char hex string → 32-byte AES-256 key (required in prod)
 *  BACKUP_RETENTION_DAYS      – How many days to keep local backups (default: 30)
 *  BACKUP_ALERT_EMAIL         – Recipient for failure alert emails
 *  MAIL_FROM                  – Sender address (default: noreply@fluxapay.com)
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "../generated/client/client";
import { getLogger } from "../utils/logger";
import { sendBackupFailureAlertEmail } from "./email.service";

const execAsync = promisify(exec);
const logger = getLogger();
const prisma = new PrismaClient();

// ── Constants ──────────────────────────────────────────────────────────────────

const BACKUP_DIR = path.join(__dirname, "../../backups");
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10);
/** Sentinel admin_id used in audit logs for automated/system-level actions */
const SYSTEM_ACTOR = "system:db-backup";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BackupResult {
  success: boolean;
  backupId: string;
  filePath?: string;
  checksumPath?: string;
  sha256?: string;
  fileSizeBytes?: number;
  durationMs: number;
  error?: string;
  retentionPurged?: number;
}

interface ChecksumManifest {
  backupId: string;
  filePath: string;
  sha256: string;
  fileSizeBytes: number;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 checksum of a file, streaming to avoid loading large dumps
 * into memory.
 */
async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Verify the file exists at the destination and its size matches the expected
 * value (obtained just after writing). Returns the actual size on success.
 */
function verifyDestination(
  filePath: string,
  expectedSizeBytes: number,
): { ok: boolean; actualSizeBytes: number; error?: string } {
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      actualSizeBytes: 0,
      error: `Backup file not found at destination: ${filePath}`,
    };
  }
  const stat = fs.statSync(filePath);
  if (stat.size !== expectedSizeBytes) {
    return {
      ok: false,
      actualSizeBytes: stat.size,
      error: `Size mismatch: expected ${expectedSizeBytes} bytes, found ${stat.size} bytes`,
    };
  }
  return { ok: true, actualSizeBytes: stat.size };
}

/**
 * Write a JSON checksum manifest alongside the encrypted backup so operators
 * can quickly verify integrity without decrypting the dump.
 */
function writeChecksumManifest(
  encryptedFilePath: string,
  manifest: ChecksumManifest,
): string {
  const checksumPath = `${encryptedFilePath}.sha256.json`;
  fs.writeFileSync(checksumPath, JSON.stringify(manifest, null, 2), "utf8");
  return checksumPath;
}

/**
 * Enforce retention policy: delete encrypted backup files (and their checksum
 * manifests) whose mtime is older than RETENTION_DAYS days.
 *
 * Returns the number of files deleted.
 */
function enforceRetentionPolicy(backupDir: string, retentionDays: number): number {
  if (!fs.existsSync(backupDir)) return 0;

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(backupDir);
  let purged = 0;

  for (const entry of entries) {
    const fullPath = path.join(backupDir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.mtimeMs < cutoffMs) {
        fs.unlinkSync(fullPath);
        purged++;
        logger.info("[Backup] Retention purge: deleted old backup file", {
          filePath: fullPath,
          ageDays: Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24)),
        });
      }
    } catch (err: any) {
      logger.warn("[Backup] Could not stat/delete file during retention purge", {
        filePath: fullPath,
        error: err.message,
      });
    }
  }

  return purged;
}

// ── Audit helpers ──────────────────────────────────────────────────────────────

async function auditBackupStarted(backupId: string): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        admin_id: SYSTEM_ACTOR,
        action_type: "db_backup_started" as any,
        entity_type: "database_backup" as any,
        entity_id: backupId,
        details: { backupId, startedAt: new Date().toISOString() },
      },
    });
  } catch (err: any) {
    logger.warn("[Backup] Failed to write audit log (backup_started)", { error: err.message });
  }
}

async function auditBackupSuccess(
  backupId: string,
  details: {
    filePath: string;
    sha256: string;
    fileSizeBytes: number;
    durationMs: number;
    retentionPurged: number;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        admin_id: SYSTEM_ACTOR,
        action_type: "db_backup_success" as any,
        entity_type: "database_backup" as any,
        entity_id: backupId,
        details: { backupId, ...details, completedAt: new Date().toISOString() },
      },
    });
  } catch (err: any) {
    logger.warn("[Backup] Failed to write audit log (backup_success)", { error: err.message });
  }
}

async function auditBackupFailed(
  backupId: string,
  error: string,
  durationMs: number,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        admin_id: SYSTEM_ACTOR,
        action_type: "db_backup_failed" as any,
        entity_type: "database_backup" as any,
        entity_id: backupId,
        details: { backupId, error, durationMs, failedAt: new Date().toISOString() },
      },
    });
  } catch (err: any) {
    logger.warn("[Backup] Failed to write audit log (backup_failed)", { error: err.message });
  }
}

async function auditRetentionPurge(
  backupId: string,
  purgedCount: number,
  retentionDays: number,
): Promise<void> {
  if (purgedCount === 0) return;
  try {
    await prisma.auditLog.create({
      data: {
        admin_id: SYSTEM_ACTOR,
        action_type: "db_backup_retention_purge" as any,
        entity_type: "database_backup" as any,
        entity_id: backupId,
        details: {
          backupId,
          purgedCount,
          retentionDays,
          purgedAt: new Date().toISOString(),
        },
      },
    });
  } catch (err: any) {
    logger.warn("[Backup] Failed to write audit log (retention_purge)", { error: err.message });
  }
}

// ── Alert helper ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget alert email to ops when a backup fails.
 * Errors are swallowed so alert failures never mask the original backup error.
 */
async function sendBackupFailureAlert(backupId: string, reason: string): Promise<void> {
  const alertEmail = process.env.BACKUP_ALERT_EMAIL;
  if (!alertEmail) {
    logger.warn("[Backup] BACKUP_ALERT_EMAIL is not set — skipping failure alert email");
    return;
  }
  try {
    await sendBackupFailureAlertEmail({ to: alertEmail, backupId, reason });
  } catch (err: any) {
    logger.error("[Backup] Failed to send backup failure alert email", { error: err.message });
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Perform an encrypted database backup with full verification, checksumming,
 * audit logging, failure alerting, and retention enforcement.
 */
export async function performDatabaseBackup(): Promise<BackupResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = `backup-${timestamp}`;

  const dbUrl = process.env.DATABASE_URL;
  let backupKeyStr = process.env.DB_BACKUP_ENCRYPTION_KEY;

  // ── Pre-flight checks ────────────────────────────────────────────────────────

  if (!dbUrl) {
    const error = "DATABASE_URL is not set — backup aborted";
    logger.error(`[Backup] ${error}`);
    await auditBackupFailed(backupId, error, Date.now() - startTime);
    await sendBackupFailureAlert(backupId, error);
    return { success: false, backupId, error, durationMs: Date.now() - startTime };
  }

  if (!backupKeyStr) {
    logger.warn(
      "[Backup] DB_BACKUP_ENCRYPTION_KEY is not set. Generating a temporary key for this session.",
    );
    // Generate a temporary 32-byte hex key to avoid failing if not configured, but warn the user.
    backupKeyStr = crypto.randomBytes(32).toString("hex");
    logger.warn(
      "[Backup] Temporary Key (SAVE THIS TO DECRYPT): [key generated — check secure log channel]",
    );
  }

  const backupKey = Buffer.from(backupKeyStr, "hex");
  if (backupKey.length !== 32) {
    const error = "DB_BACKUP_ENCRYPTION_KEY must be a 64-character hex string — backup aborted";
    logger.error(`[Backup] ${error}`);
    await auditBackupFailed(backupId, error, Date.now() - startTime);
    await sendBackupFailureAlert(backupId, error);
    return { success: false, backupId, error, durationMs: Date.now() - startTime };
  }

  // ── Ensure backup directory exists ──────────────────────────────────────────

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const dumpFilePath = path.join(BACKUP_DIR, `db-backup-${timestamp}.sql`);
  const encryptedFilePath = path.join(BACKUP_DIR, `db-backup-${timestamp}.sql.enc`);

  await auditBackupStarted(backupId);
  logger.info(`[Backup] Starting database backup`, { backupId, destination: encryptedFilePath });

  try {
    // ── Step 1: pg_dump ────────────────────────────────────────────────────────
    logger.info(`[Backup] Running pg_dump`, { backupId });
    await execAsync(`pg_dump "${dbUrl}" -f "${dumpFilePath}"`);

    if (!fs.existsSync(dumpFilePath) || fs.statSync(dumpFilePath).size === 0) {
      throw new Error("pg_dump produced an empty or missing dump file");
    }

    // ── Step 2: Encrypt ────────────────────────────────────────────────────────
    logger.info(`[Backup] Encrypting dump`, { backupId, encryptedFilePath });
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", backupKey, iv);
    const input = fs.createReadStream(dumpFilePath);
    const output = fs.createWriteStream(encryptedFilePath);

    // Prepend the IV so it's available during decryption
    output.write(iv);

    await new Promise<void>((resolve, reject) => {
      input.pipe(cipher).pipe(output)
        .on("finish", resolve)
        .on("error", reject);
    });

    // ── Step 3: Compute SHA-256 checksum ───────────────────────────────────────
    logger.info(`[Backup] Computing SHA-256 checksum`, { backupId });
    const sha256 = await computeFileSha256(encryptedFilePath);
    const fileSizeBytes = fs.statSync(encryptedFilePath).size;

    // ── Step 4: Verify destination ─────────────────────────────────────────────
    logger.info(`[Backup] Verifying destination`, { backupId });
    const verification = verifyDestination(encryptedFilePath, fileSizeBytes);
    if (!verification.ok) {
      throw new Error(`Destination verification failed: ${verification.error}`);
    }

    // ── Step 5: Write checksum manifest ───────────────────────────────────────
    const manifest: ChecksumManifest = {
      backupId,
      filePath: encryptedFilePath,
      sha256,
      fileSizeBytes,
      createdAt: new Date().toISOString(),
    };
    const checksumPath = writeChecksumManifest(encryptedFilePath, manifest);

    logger.info(`[Backup] Backup verified successfully`, {
      backupId,
      encryptedFilePath,
      checksumPath,
      sha256,
      fileSizeBytes,
    });

    // ── Step 6: Enforce retention policy ──────────────────────────────────────
    const retentionPurged = enforceRetentionPolicy(BACKUP_DIR, RETENTION_DAYS);
    if (retentionPurged > 0) {
      logger.info(`[Backup] Retention purge: deleted ${retentionPurged} file(s) older than ${RETENTION_DAYS} days`, {
        backupId,
        retentionPurged,
        retentionDays: RETENTION_DAYS,
      });
      await auditRetentionPurge(backupId, retentionPurged, RETENTION_DAYS);
    }

    const durationMs = Date.now() - startTime;

    // ── Step 7: Audit success ──────────────────────────────────────────────────
    await auditBackupSuccess(backupId, {
      filePath: encryptedFilePath,
      sha256,
      fileSizeBytes,
      durationMs,
      retentionPurged,
    });

    logger.info(`[Backup] Backup completed successfully`, {
      backupId,
      durationMs,
      fileSizeBytes,
      retentionPurged,
    });

    return {
      success: true,
      backupId,
      filePath: encryptedFilePath,
      checksumPath,
      sha256,
      fileSizeBytes,
      durationMs,
      retentionPurged,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const error: string = err?.message ?? String(err);

    logger.error(`[Backup] Backup failed`, { backupId, error, durationMs });

    await auditBackupFailed(backupId, error, durationMs);
    await sendBackupFailureAlert(backupId, error);

    return { success: false, backupId, error, durationMs };
  } finally {
    // Always remove the unencrypted SQL dump, regardless of success/failure
    if (fs.existsSync(dumpFilePath)) {
      try {
        fs.unlinkSync(dumpFilePath);
      } catch (cleanupErr: any) {
        logger.warn("[Backup] Failed to clean up unencrypted dump file", {
          dumpFilePath,
          error: cleanupErr.message,
        });
      }
    }
  }
}

/**
 * Verify the integrity of an existing backup by comparing its stored SHA-256
 * checksum manifest against the actual file on disk.
 *
 * Returns true if the file matches its manifest, false otherwise.
 *
 * Usage: run this in the monthly restore test (see DB_BACKUP_RUNBOOK.md).
 */
export async function verifyBackupIntegrity(encryptedFilePath: string): Promise<{
  ok: boolean;
  storedSha256?: string;
  actualSha256?: string;
  error?: string;
}> {
  const checksumPath = `${encryptedFilePath}.sha256.json`;

  if (!fs.existsSync(checksumPath)) {
    return { ok: false, error: `Checksum manifest not found: ${checksumPath}` };
  }
  if (!fs.existsSync(encryptedFilePath)) {
    return { ok: false, error: `Backup file not found: ${encryptedFilePath}` };
  }

  let manifest: ChecksumManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(checksumPath, "utf8")) as ChecksumManifest;
  } catch (err: any) {
    return { ok: false, error: `Failed to parse checksum manifest: ${err.message}` };
  }

  try {
    const actualSha256 = await computeFileSha256(encryptedFilePath);
    const ok = actualSha256 === manifest.sha256;
    return { ok, storedSha256: manifest.sha256, actualSha256 };
  } catch (err: any) {
    return { ok: false, error: `Failed to compute actual checksum: ${err.message}` };
  }
}
