/**
 * Guards the Payment indexes that back hot query paths against accidental
 * removal. PaymentService.checkRateLimit() counts payments by merchantId with
 * createdAt >= windowStart; without a composite index this is a table scan.
 */

import fs from "fs";
import path from "path";

const prismaDir = path.join(__dirname, "../../prisma");

function getPaymentModel(): string {
  const schema = fs.readFileSync(path.join(prismaDir, "schema.prisma"), "utf8");
  const match = schema.match(/^model Payment \{[\s\S]*?^\}/m);
  if (!match) throw new Error("Payment model not found in schema.prisma");
  return match[0];
}

describe("Payment schema indexes", () => {
  it("declares a composite [merchantId, createdAt] index for rate-limit counts", () => {
    expect(getPaymentModel()).toMatch(/@@index\(\[merchantId,\s*createdAt(\(sort:\s*Desc\))?\]\)/);
  });

  it("has a migration that creates the [merchantId, createdAt] index", () => {
    const migrationsDir = path.join(prismaDir, "migrations");
    const sql = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(migrationsDir, d.name, "migration.sql"))
      .filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n");

    expect(sql).toMatch(/CREATE INDEX[^;]*"Payment_merchantId_createdAt_idx"\s+ON\s+"Payment"\s*\(\s*"merchantId",\s*"createdAt"/);
  });
});
