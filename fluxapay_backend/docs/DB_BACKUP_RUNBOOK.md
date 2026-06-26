# DB Backup Runbook

**Author:** FluxaPay Platform Team  
**Status:** Active  
**Last Updated:** June 2026

---

## Overview

FluxaPay performs automated, encrypted database backups daily at **02:00 UTC** via the
`performDatabaseBackup()` function in `src/services/dbBackup.service.ts`.

Each backup run:
1. Dumps the PostgreSQL database with `pg_dump`
2. Encrypts the dump with AES-256-CBC (IV prepended)
3. Computes a SHA-256 checksum of the encrypted file
4. Verifies the file exists at the destination with the expected size
5. Writes a `.sha256.json` checksum manifest alongside the backup file
6. Records audit log entries (`db_backup_started`, `db_backup_success` / `db_backup_failed`)
7. Sends an email alert to `BACKUP_ALERT_EMAIL` on failure
8. Purges local backup files older than `BACKUP_RETENTION_DAYS` (default: **30 days**)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `DB_BACKUP_ENCRYPTION_KEY` | ✅ prod | 64-char hex string (32 bytes) for AES-256 |
| `BACKUP_RETENTION_DAYS` | Optional | Days to keep local backups (default: `30`) |
| `BACKUP_ALERT_EMAIL` | Recommended | Ops email for failure alerts |
| `DB_BACKUP_CRON` | Optional | Cron schedule (default: `0 2 * * *`) |

### Generating a Backup Encryption Key

```bash
# Generate a secure 32-byte (64-char hex) key
openssl rand -hex 32
```

Store the output in your secrets manager (AWS Secrets Manager / environment config).
**Never commit this key to source control.**

---

## Backup File Layout

```
backups/
  db-backup-2026-06-26T02-00-00-000Z.sql.enc        # encrypted dump
  db-backup-2026-06-26T02-00-00-000Z.sql.enc.sha256.json  # checksum manifest
```

The `.sha256.json` manifest contains:

```json
{
  "backupId": "backup-2026-06-26T02-00-00-000Z",
  "filePath": "/app/backups/db-backup-2026-06-26T02-00-00-000Z.sql.enc",
  "sha256": "<hex-checksum>",
  "fileSizeBytes": 1234567,
  "createdAt": "2026-06-26T02:00:01.234Z"
}
```

---

## Verifying a Backup

### Via Code (programmatic)

```typescript
import { verifyBackupIntegrity } from "./src/services/dbBackup.service";

const result = await verifyBackupIntegrity("/app/backups/db-backup-2026-06-26T02-00-00-000Z.sql.enc");
console.log(result);
// { ok: true, storedSha256: "abc...", actualSha256: "abc..." }
```

### Manual SHA-256 Check

```bash
# Compute checksum and compare to the manifest
sha256sum /app/backups/db-backup-2026-06-26T02-00-00-000Z.sql.enc
cat /app/backups/db-backup-2026-06-26T02-00-00-000Z.sql.enc.sha256.json | jq .sha256
```

---

## Decrypting and Restoring a Backup

> ⚠️ **Restore from backup is destructive.** Always confirm with at least two engineers
> and the engineering lead before running against production.

### Step 1 — Decrypt the backup

```bash
# Set your backup encryption key
BACKUP_KEY="<64-char-hex-key>"
ENCRYPTED_FILE="db-backup-2026-06-26T02-00-00-000Z.sql.enc"

# Extract the 16-byte IV (first 16 bytes of the file) and the ciphertext
dd if="$ENCRYPTED_FILE" bs=16 count=1 of=iv.bin 2>/dev/null
dd if="$ENCRYPTED_FILE" bs=16 skip=1 of=ciphertext.bin 2>/dev/null

# Decrypt using openssl
openssl enc -d -aes-256-cbc \
  -K "$BACKUP_KEY" \
  -iv "$(xxd -p iv.bin | tr -d '\n')" \
  -in ciphertext.bin \
  -out restored.sql

echo "Decryption complete: restored.sql"
rm iv.bin ciphertext.bin
```

### Step 2 — Verify the decrypted dump

```bash
# Sanity-check the SQL is valid PostgreSQL
head -20 restored.sql
```

### Step 3 — Restore to the target database

```bash
# Drop + recreate the database (DESTRUCTIVE)
psql -U admin -h db.prod -c "DROP DATABASE fluxapay_restore;"
psql -U admin -h db.prod -c "CREATE DATABASE fluxapay_restore;"

# Restore
psql -U admin -h db.prod -d fluxapay_restore < restored.sql

echo "Restore complete"
```

### Step 4 — Verify the restore

```bash
# Check row counts for key tables
psql -U admin -h db.prod -d fluxapay_restore -c \
  "SELECT 'merchants' AS tbl, COUNT(*) FROM \"Merchant\"
   UNION ALL SELECT 'payments', COUNT(*) FROM \"Payment\"
   UNION ALL SELECT 'audit_logs', COUNT(*) FROM \"AuditLog\";"
```

### Step 5 — Swap databases (if replacing production)

Coordinate with DevOps to update `DATABASE_URL` and restart the backend pods after
verifying the restored database is consistent.

---

## Monthly Restore Test (Required)

A restore test **must be performed monthly** to ensure backups are restorable before
they are actually needed.

### Procedure

1. **Identify the most recent backup file** in the `backups/` directory (or remote storage).
2. **Verify integrity** using `verifyBackupIntegrity()` or the manual SHA-256 check above.
3. **Decrypt and restore** to a dedicated staging/restore database (never production).
4. **Run validation queries** (Step 4 above) and confirm all critical tables are present.
5. **Document the result** in the table below.
6. **Clean up** the restored staging database after confirmation.

### Restore Test Log

| Date | Backup File | Verified SHA-256 | Restore DB | Result | Engineer |
|---|---|---|---|---|---|
| _YYYY-MM-DD_ | `db-backup-…enc` | ✅ / ❌ | `fluxapay_restore_test` | Pass / Fail | _Name_ |
| | | | | | |

---

## Troubleshooting

### Backup Failed Alert Email Received

1. Check application logs for the `[Backup] Backup failed` log line and the `backupId`.
2. Query the audit log for the failure details:

```sql
SELECT details FROM "AuditLog"
WHERE action_type = 'db_backup_failed'
ORDER BY created_at DESC
LIMIT 5;
```

3. Common causes:
   - `DATABASE_URL` not set or invalid → verify env var
   - `DB_BACKUP_ENCRYPTION_KEY` wrong length → must be 64 hex chars (32 bytes)
   - `pg_dump` not installed or not in `$PATH` → check Docker image
   - Insufficient disk space in `backups/` directory
   - Database connection refused → check DB health

4. Once fixed, the next cron run will retry automatically. For immediate retry,
   call `performDatabaseBackup()` directly from a maintenance script or REPL.

### Backup File Missing After Successful Audit Log

The retention purge may have deleted it if `BACKUP_RETENTION_DAYS` is set too low.
Check the `db_backup_retention_purge` audit entries:

```sql
SELECT details FROM "AuditLog"
WHERE action_type = 'db_backup_retention_purge'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Retention Policy

Local backups older than `BACKUP_RETENTION_DAYS` (default **30 days**) are automatically
deleted during each successful backup run.

**For longer retention**, configure an off-host storage solution (S3, GCS) and copy/upload
the encrypted backup file and its checksum manifest after each successful run. The
encryption key stays in your secrets manager — only the ciphertext goes to remote storage.

Example upload snippet (add to `dbBackup.service.ts` after `writeChecksumManifest`):

```typescript
// Example: upload to S3 (requires @aws-sdk/client-s3)
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION });
await s3.send(new PutObjectCommand({
  Bucket: process.env.BACKUP_S3_BUCKET,
  Key: `backups/${path.basename(encryptedFilePath)}`,
  Body: fs.createReadStream(encryptedFilePath),
  ContentType: "application/octet-stream",
  Metadata: { sha256, backupId },
}));
```

---

## Audit Log Reference

| `action_type` | When written |
|---|---|
| `db_backup_started` | At the beginning of every backup run |
| `db_backup_success` | After successful verification and checksum |
| `db_backup_failed` | On any error that prevents a complete backup |
| `db_backup_retention_purge` | When old files are deleted by the retention policy |

Query example:

```sql
SELECT action_type, entity_id AS backup_id, created_at, details
FROM "AuditLog"
WHERE entity_type = 'database_backup'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Related Documents

- [MAINNET_GO_LIVE_CHECKLIST.md](MAINNET_GO_LIVE_CHECKLIST.md) — pre-launch backup validation steps
- [AUDIT_LOGGING_IMPLEMENTATION.md](../AUDIT_LOGGING_IMPLEMENTATION.md) — audit trail details
- `src/services/dbBackup.service.ts` — backup service implementation
- `src/services/cron.service.ts` — cron schedule registration (`DB_BACKUP_CRON`)
