import { prisma } from "../../config/prisma";

/**
 * Truncates every table in the public schema (except Prisma migrations) in one
 * statement. Intended for Jest beforeEach/afterEach in integration suites.
 * Refuses to run unless the DB name looks like a test database.
 */
export async function cleanDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test|ci/i.test(url) && process.env.NODE_ENV !== "test") {
    throw new Error("cleanDatabase refused: DATABASE_URL does not look like a test database");
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function disconnectTestDatabase(): Promise<void> {
  await prisma.$disconnect();
}
