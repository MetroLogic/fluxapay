import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getLogger } from "../utils/logger";

const execAsync = promisify(exec);
const logger = getLogger();

export async function performDatabaseBackup(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  let backupKeyStr = process.env.DB_BACKUP_ENCRYPTION_KEY;

  if (!dbUrl) {
    logger.error("[Backup] DATABASE_URL is not set for backups.");
    return;
  }
  if (!backupKeyStr) {
    logger.warn("[Backup] DB_BACKUP_ENCRYPTION_KEY is not set. Generating a temporary key for this session.");
    // Generate a temporary 32-byte hex key to avoid failing if not configured, but warn the user.
    backupKeyStr = crypto.randomBytes(32).toString('hex');
    logger.warn(`[Backup] Temporary Key (SAVE THIS TO DECRYPT): ${backupKeyStr}`);
  }

  // Make sure we have a 32-byte key for AES-256
  const backupKey = Buffer.from(backupKeyStr, "hex");
  if (backupKey.length !== 32) {
    logger.error("[Backup] DB_BACKUP_ENCRYPTION_KEY must be a 64-character hex string.");
    return;
  }

  const backupDir = path.join(__dirname, "../../backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpFilePath = path.join(backupDir, `db-backup-${timestamp}.sql`);
  const encryptedFilePath = path.join(backupDir, `db-backup-${timestamp}.sql.enc`);

  try {
    logger.info(`[Backup] Starting database dump to ${dumpFilePath}`);
    // Exclude stdout/stderr logging unless there is an error to avoid leaking data
    await execAsync(`pg_dump "${dbUrl}" -f "${dumpFilePath}"`);

    logger.info(`[Backup] Encrypting dump to ${encryptedFilePath}`);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", backupKey, iv);

    const input = fs.createReadStream(dumpFilePath);
    const output = fs.createWriteStream(encryptedFilePath);

    // Write the IV at the beginning of the file so it can be decrypted
    output.write(iv);

    await new Promise<void>((resolve, reject) => {
      input.pipe(cipher).pipe(output)
        .on("finish", () => resolve())
        .on("error", (err) => reject(err));
    });

    logger.info(`[Backup] Backup encrypted successfully: ${encryptedFilePath}`);
  } catch (err: any) {
    logger.error(`[Backup] Error during backup: ${err.message}`);
  } finally {
    // Clean up the unencrypted SQL file
    if (fs.existsSync(dumpFilePath)) {
      fs.unlinkSync(dumpFilePath);
    }
  }
}
