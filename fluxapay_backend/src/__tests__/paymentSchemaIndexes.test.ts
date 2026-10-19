/*
 * Guards the Payment indexes that back hot query paths against accidental
 * removal. PaymentService.checkRateLimit() counts payments by merchantId with
 * createdAt >= windowStart; without a composite index this is a table scan.
 *
 * Issue #1208 extends this to the GET /payments ("transactions") list endpoint,
 * which filters on merchantId plus any combination of is_test_mode, status,
 * currency, a createdAt range, and a customer_email search.
 */

import fs from "fs";
import path from "path";

const prismaDir = path.join(__dirname, "../../prisma");

function getPaymentModel(): string {
  const schema = fs.readFileSync(path.join(prismaDir, "schema.prisma"), "utf8");
  const start = schema.indexOf("model Payment {");
  const end = schema.indexOf("\n}", start);
  if (start < 0 || end < 0) throw new Error("Payment model not found in schema.prisma");
  return schema.slice(start, end + 2);
}

function getAllMigrationSql(): string {
  const migrationsDir = path.join(prismaDir, "migrations");
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(migrationsDir, d.name, "migration.sql"))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
}

describe("Payment schema indexes", () => {
  it("declares and migrates the merchant/status/createdAt DESC transaction-list index", () => {
    const paymentModel = getPaymentModel();
    const migrationSql = getAllMigrationSql();

    expect(paymentModel).toMatch(
      /@@index\(\[merchantId,\s*status,\s*createdAt\(sort:\s*Desc\)\]\)/,
    );
    expect(migrationSql).toMatch(
      /CREATE INDEX IF NOT EXISTS "Payment_merchantId_status_createdAt_idx"\s+ON\s+"Payment"\s*\(\s*"merchantId",\s*"status",\s*"createdAt"\s+DESC\s*\)/,
    );
  });

  it("declares a composite [merchantId, createdAt] index for rate-limit counts", () => {
    expect(getPaymentModel()).toMatch(/@@index\(\[merchantId,\s*createdAt(\(sort:\s*Desc\))?\]\)/);
  });

  it("has a migration that creates the [merchantId, createdAt] index", () => {
    const sql = getAllMigrationSql();

    expect(sql).toMatch(/CREATE INDEX[^;]*"Payment_merchantId_createdAt_idx"\s+ON\s+"Payment"\s*\(\s*"merchantId",\s*"createdAt"/);
  });
});

/**
 * Issue #1208 — indexes backing the transaction list endpoint's filter
 * combinations. Each case asserts both the Prisma schema declaration and the
 * corresponding migration, because CI runs `prisma db push` while staging runs
 * `prisma migrate deploy`; an index present in only one of the two never lands.
 */
describe("Payment list endpoint indexes (#1208)", () => {
  /**
   * Each case lists the columns the index covers, so the schema assertion and
   * the migration assertion are derived from the same source of truth.
   */
  const indexCases: Array<{ name: string; columns: string[] }> = [
    // GET /payments?currency=...
    {
      name: "Payment_merchantId_currency_createdAt_idx",
      columns: ["merchantId", "currency", "createdAt"],
    },
    // GET /payments?status=...&currency=...
    {
      name: "Payment_merchantId_status_currency_createdAt_idx",
      columns: ["merchantId", "status", "currency", "createdAt"],
    },
    // GET /payments?date_from=...&date_to=... combined with a status filter
    {
      name: "Payment_merchantId_is_test_mode_status_createdAt_idx",
      columns: ["merchantId", "is_test_mode", "status", "createdAt"],
    },
    // GET /payments?search=... (customer_email arm)
    {
      name: "Payment_merchantId_customer_email_idx",
      columns: ["merchantId", "customer_email"],
    },
  ];

  const migrationSql = getAllMigrationSql();

  for (const { name, columns } of indexCases) {
    it(`declares the ${columns.join(" + ")} index in schema.prisma`, () => {
      const declarationColumns = columns.map((column, index) =>
        column === "createdAt" && index === columns.length - 1
          ? `${column}(sort: Desc)`
          : column,
      );
      expect(getPaymentModel()).toContain(`@@index([${declarationColumns.join(", ")}])`);
    });

    it(`has a migration that creates ${name}`, () => {
      const quoted = columns.map((c) => `"${c}"`).join(",\\s*");
      expect(migrationSql).toMatch(
        new RegExp(`CREATE INDEX[^;]*"${name}"\\s+ON\\s+"Payment"\\s*\\(\\s*${quoted}`),
      );
    });
  }
});
