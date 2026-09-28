# Contributing to FluxaPay

Contributions are welcome! Please read this document for information on how to contribute safely and effectively.

## Table of Contents
- [Getting Started](#getting-started)
- [Development Environment Setup](#development-environment-setup)
- [Branch Naming Convention](#branch-naming-convention)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Running Tests Locally](#running-tests-locally)
- [Database Migrations & Rollbacks](#database-migrations--rollbacks)

## Getting Started

Before you start contributing, please:
1. Fork the repository
2. Set up your development environment (see below)
3. Create a feature branch following our naming convention
4. Make your changes with clear, descriptive commits
5. Run tests locally before submitting a PR
6. Submit a Pull Request with a clear description

## Development Environment Setup

### Prerequisites
- **Node.js** 18.x or 20.x
- **Docker** and **Docker Compose** (for local PostgreSQL)
- **Git**
- **npm** (comes with Node.js)

### Backend Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/fluxapay.git
   cd fluxapay
   ```

2. Navigate to the backend directory:
   ```bash
   cd fluxapay_backend
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

5. Start the local development environment with Docker Compose:
   ```bash
   docker-compose up -d
   ```

6. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

7. Seed the database (optional):
   ```bash
   npm run seed
   ```

8. Start the development server:
   ```bash
   npm run dev
   ```

The backend API will be available at `http://localhost:3000`.

### Running Tests

See [Running Tests Locally](#running-tests-locally) section below.

## Branch Naming Convention

We follow a structured branch naming convention to keep the repository organized:

- **`feat/`** – New features
  - Example: `feat/webhook-signature-verification`
- **`fix/`** – Bug fixes
  - Example: `fix/payment-status-race-condition`
- **`test/`** – Adding or updating tests
  - Example: `test/auth-service-coverage`
- **`chore/`** – Maintenance tasks, dependency updates, CI/CD changes
  - Example: `chore/update-dependencies`
- **`docs/`** – Documentation updates
  - Example: `docs/api-usage-examples`
- **`refactor/`** – Code refactoring without changing functionality
  - Example: `refactor/payment-service-cleanup`
- **`perf/`** – Performance improvements
  - Example: `perf/optimize-database-queries`

**Branch naming format:** `<type>/<brief-description-in-kebab-case>`

## Commit Message Format

We follow the **Conventional Commits** specification. This helps with automated changelog generation and semantic versioning.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (whitespace, formatting)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvement
- **test**: Adding or correcting tests
- **chore**: Changes to build process, tooling, dependencies

### Examples

```
feat(payments): add webhook signature verification

Implements HMAC-SHA256 signature verification for incoming webhook
requests to prevent spoofing attacks.

Closes #123
```

```
fix(auth): prevent race condition in IP lockout

The IP lockout counter was not being properly incremented due to
concurrent request handling. Added database transaction isolation.

Fixes #456
```

```
test(auth): add IP lockout coverage

Added comprehensive tests for IP-level brute force protection
including threshold triggering and independence from account lockout.
```

```
chore(deps): update stellar-sdk to v11.2.0
```

### Commit Message Guidelines

- Use the imperative mood ("add" not "added" or "adds")
- Keep the first line under 72 characters
- Reference issue numbers in the footer
- Provide context in the body for non-trivial changes

## Pull Request Process

1. **Create a Pull Request** against the `main` branch
2. **Fill out the PR template** completely (see `.github/PULL_REQUEST_TEMPLATE.md`)
3. **Ensure CI passes**: All automated tests and checks must pass
4. **Request review**: Tag at least one maintainer for review
5. **Address feedback**: Respond to all review comments
6. **Keep PR focused**: One feature/fix per PR when possible
7. **Update documentation**: If your change affects user-facing behavior

### PR Approval Requirements

- ✅ All CI checks must pass
- ✅ At least one approving review from a maintainer
- ✅ No unresolved conversations
- ✅ Branch is up-to-date with `main`
- ✅ For destructive migrations: `migration-approved` label applied

### After Approval

Once approved, a maintainer will merge your PR. We typically use:
- **Squash and merge** for feature branches
- **Rebase and merge** for clean, atomic commits

## Running Tests Locally

### Unit Tests

Run all unit tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm test -- --watch
```

Run tests with coverage:
```bash
npm test -- --coverage
```

Run specific test file:
```bash
npm test -- src/services/auth.service.test.ts
```

### Integration Tests

Run integration tests:
```bash
npm run test:integration
```

### Linting

Run ESLint:
```bash
npm run lint
```

Auto-fix linting issues:
```bash
npm run lint:fix
```

### Type Checking

Run TypeScript type checker:
```bash
npm run type-check
```

### All Pre-Commit Checks

Run all checks before committing:
```bash
npm run lint && npm test && npm run type-check
```

## Database Migrations & Rollbacks

When altering the database schema, extreme care must be taken in production to avoid data loss. We categorize migrations into two types:
- **Additive**: Adding tables, columns, or non-destructive changes. These are deployed automatically.
- **Destructive**: Dropping tables, dropping columns, or modifying types that cause data truncation.

### Automated Migration Safety Checks

A GitHub Actions workflow automatically runs on every PR that modifies:
- `fluxapay_backend/prisma/migrations/**`
- `fluxapay_backend/prisma/schema.prisma`

The workflow (`migration-safety.yml`) executes `scripts/migration-safety.ts` to detect destructive operations such as:
- `DROP TABLE`
- `DROP COLUMN`
- `DROP TYPE`

If a destructive migration is detected, the CI job will **fail** and block the PR unless the `migration-approved` label is applied.

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
