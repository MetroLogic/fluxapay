import { PrismaClient } from "../generated/client/client";

function withConnectionLimit(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", process.env.NODE_ENV === "production" ? "10" : "5");
  }
  return url.toString();
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = withConnectionLimit(process.env.DATABASE_URL);
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}