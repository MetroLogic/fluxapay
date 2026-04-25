# Local Development Seed Script

Populates your local database with a predictable set of demo data so you can
start developing and testing immediately — no manual API calls required.

## What gets seeded

| Resource | Count | Notes |
|---|---|---|
| Merchant | 1 | Active status, API key, bank account |
| Customers | 3 | alice, bob, carol |
| Payments | 10 | All statuses: confirmed, pending, expired, failed, partially_paid, overpaid |
| Invoices | 4 | paid, paid, overdue, pending |
| Webhook Logs | 6 | delivered, failed, retrying |

## Usage

```bash
# First time (or after a clean DB)
npm run seed

# Wipe all demo data and re-seed from scratch
npm run seed:reset

# Or run directly with ts-node
npx ts-node prisma/seed.ts
npx ts-node prisma/seed.ts --reset
```

The script is **idempotent** — running `npm run seed` multiple times without
`--reset` is safe. It uses `upsert` throughout, so existing records are left
unchanged and no duplicates are created.

## Demo credentials

After seeding, the following credentials are printed to the terminal and are
always the same:

| Field | Value |
|---|---|
| Email | `demo@fluxapay.dev` |
| Password | `Demo1234!` |
| API Key | `fpk_test_d3m0d3m0d3m0d3m0d3m0d3m0d3m0d3m0` |

## Quick start examples

```bash
# List payments
curl http://localhost:3000/api/v1/payments \
  -H "x-api-key: fpk_test_d3m0d3m0d3m0d3m0d3m0d3m0d3m0d3m0"

# Create a payment
curl -X POST http://localhost:3000/api/v1/payments \
  -H "x-api-key: fpk_test_d3m0d3m0d3m0d3m0d3m0d3m0d3m0d3m0" \
  -H "Content-Type: application/json" \
  -d '{"amount":50,"currency":"USDC","customer_email":"test@example.com"}'

# List invoices
curl http://localhost:3000/api/v1/invoices \
  -H "x-api-key: fpk_test_d3m0d3m0d3m0d3m0d3m0d3m0d3m0d3m0"

# Export an invoice as PDF
curl "http://localhost:3000/api/v1/invoices/seed-inv-001/export?format=pdf" \
  -H "x-api-key: fpk_test_d3m0d3m0d3m0d3m0d3m0d3m0d3m0d3m0" \
  --output invoice.pdf

# List webhook logs (via dashboard)
curl http://localhost:3000/api/v1/webhooks \
  -H "x-api-key: fpk_test_d3m0d3m0d3m0d3m0d3m0d3m0d3m0d3m0"
```

## Prerequisites

1. PostgreSQL running and `DATABASE_URL` set in `.env`
2. Prisma migrations applied:
   ```bash
   npx prisma migrate dev
   # or for a clean push without migration history:
   npx prisma db push
   ```
3. Prisma client generated:
   ```bash
   npm run prisma:generate
   ```

## Typical local dev workflow

```bash
# 1. Start Postgres (Docker Compose)
docker compose up -d db

# 2. Apply migrations
npx prisma migrate dev

# 3. Seed demo data
npm run seed

# 4. Start the dev server
npm run dev
```

## Seeded payment statuses

| ID | Amount | Status | Notes |
|---|---|---|---|
| seed-pay-001 | 150 USDC | confirmed | swept + settled, 3 days ago |
| seed-pay-002 | 75.50 USDC | pending | fresh, has Stellar address |
| seed-pay-003 | 200 USDC | expired | 5 days ago |
| seed-pay-004 | 50 USDC | failed | 4 days ago |
| seed-pay-005 | 300 USDC | confirmed | swept + settled, 8 days ago |
| seed-pay-006 | 99.99 USDC | partially_paid | has Stellar address |
| seed-pay-007 | 500 USDC | overpaid | has Stellar address + tx hash |
| seed-pay-008 | 25 USDC | pending | fresh |
| seed-pay-009 | 180 USDC | confirmed | swept + settled, 15 days ago |
| seed-pay-010 | 45 USDC | pending | fresh |

## Notes

- The demo API key uses the `fpk_test_` prefix (FluxaPay test key) and is
  intentionally low-entropy and fixed so it is easy to remember and copy.
  **Never use it outside of local development.**
- Stellar addresses in the seed data are real testnet addresses but are not
  controlled by the seed script — they are used for display purposes only.
- The `--reset` flag deletes records in the correct dependency order to avoid
  foreign-key constraint errors.
