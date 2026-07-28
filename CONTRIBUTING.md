# Contributing to FluxaPay

Contributions are welcome! Please read this document for information on how to contribute safely and effectively.

## Database Migrations & Rollbacks

When altering the database schema, extreme care must be taken in production to avoid data loss. We categorize migrations into two types:
- **Additive**: Adding tables, columns, or non-destructive changes. These are deployed automatically.
- **Destructive**: Dropping tables, dropping columns, or modifying types that cause data truncation.

### Destructive Migration Policy
1. Automated CI/CD pipelines will halt if a destructive migration is detected.
2. Destructive migrations require manual approval via the `migration-approved` label on the corresponding Pull Request.
3. A pre-migration backup is **automatically triggered** when a destructive migration is approved and deployed.

### Backup Process
Backups are orchestrated via `src/services/dbBackup.service.ts`.
- The service creates an encrypted, checksummed `.sql.enc` dump of the database.
- It requires `DATABASE_URL` and `DB_BACKUP_ENCRYPTION_KEY` environment variables.
- You can manually trigger a backup by running:
  ```bash
  npx ts-node src/services/dbBackup.service.ts
  ```

### Restore Process
To restore from a backup:
1. Locate the correct `.sql.enc` file in the backups directory (or remote storage).
2. Decrypt the file using the backup encryption key:
   ```bash
   openssl enc -d -aes-256-cbc -in db-backup-<timestamp>.sql.enc -out restore.sql -k <DB_BACKUP_ENCRYPTION_KEY>
   ```
3. Verify the SHA-256 checksum against the manifest to ensure integrity.
4. Restore the database:
   ```bash
   psql $DATABASE_URL < restore.sql
   ```

### Emergency Rollback
If a deployed migration breaks production:
1. Revert the commit in Git and push to main. This prevents further faulty deployments.
2. If schema changes were destructive, follow the **Restore Process** above using the automated backup taken just prior to the migration.
3. If changes were additive but broken, apply a hotfix to manually drop or revert the additive changes through a new migration script (`prisma migrate dev --create-only`).
