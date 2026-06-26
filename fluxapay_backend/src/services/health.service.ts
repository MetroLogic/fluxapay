import { PrismaClient } from "../generated/client/client";
import { getRedisClient } from "../sms/otpSmsRateLimiter";

export const DEPENDENCY_TIMEOUT_MS = 200;

const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";

export type DependencyName = "database" | "redis" | "horizon";
export type DependencyStatus = "up" | "down";

export interface DependencyCheckResult {
  status: DependencyStatus;
  latencyMs: number;
}

export interface ReadinessResult {
  status: "ok" | "degraded";
  dependencies: Record<DependencyName, DependencyCheckResult>;
}

export function getUptimeSeconds(): number {
  return Math.floor(process.uptime());
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function timedCheck(
  check: () => Promise<void>,
  timeoutMs = DEPENDENCY_TIMEOUT_MS,
): Promise<DependencyCheckResult> {
  const started = Date.now();

  try {
    await withTimeout(check(), timeoutMs);
    return { status: "up", latencyMs: Date.now() - started };
  } catch {
    return { status: "down", latencyMs: Date.now() - started };
  }
}

export async function checkDatabase(prisma: PrismaClient): Promise<DependencyCheckResult> {
  return timedCheck(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
}

export async function checkRedis(): Promise<DependencyCheckResult> {
  return timedCheck(async () => {
    const redis = getRedisClient();
    const result = await redis.ping();
    if (result !== "PONG") {
      throw new Error("unexpected ping response");
    }
  });
}

export async function checkHorizon(): Promise<DependencyCheckResult> {
  return timedCheck(async () => {
    const response = await fetch(HORIZON_URL, { method: "GET" });
    if (!response.ok) {
      throw new Error(`horizon returned ${response.status}`);
    }
  });
}

export async function getReadiness(prisma: PrismaClient): Promise<ReadinessResult> {
  const [database, redis, horizon] = await Promise.all([
    checkDatabase(prisma),
    checkRedis(),
    checkHorizon(),
  ]);

  const dependencies = { database, redis, horizon };
  const allUp = Object.values(dependencies).every((dependency) => dependency.status === "up");

  return {
    status: allUp ? "ok" : "degraded",
    dependencies,
  };
}
