import { PrismaClient } from "../generated/client/client";

/**
 * Singleton PrismaClient instance shared across all services.
 *
 * Enforces a single database connection pool to prevent connection exhaustion.
 * Connection pool sizing is configured via DATABASE_URL:
 * - Dev: connection_limit=5 (local dev)
 * - Staging: connection_limit=20 (concurrent requests)
 * - Production: connection_limit=50+ (scale with expected load)
 *
 * Graceful shutdown closes all connections via shutdown.service.ts
 * (do NOT call $disconnect in individual services).
 */
let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export const prisma = getPrismaClient();
