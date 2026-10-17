import { PrismaClient } from "../generated/client/client";
import { getLogger, getMetricsCollector } from "../utils/logger";

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const REPLICA_LAG_THRESHOLD_SECONDS = 30;
const REPLICA_HEALTH_CHECK_INTERVAL_MS = 10_000;

type DynamicClient = Record<string, unknown>;
type ReadReplicaOptions = {
  logger?: ReturnType<typeof getLogger>;
  metrics?: ReturnType<typeof getMetricsCollector>;
  lagThresholdSeconds?: number;
  healthCheckIntervalMs?: number;
};

function withConnectionLimit(databaseUrl: string, defaultLimit: number): string {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(defaultLimit));
  }
  return url.toString();
}

export function createReadReplicaClient<T extends PrismaClient>(
  primary: T,
  replica: T,
  options: ReadReplicaOptions = {},
): { client: T; checkReplicaHealth: () => Promise<void> } {
  const logger = options.logger ?? getLogger("Database");
  const metrics = options.metrics ?? getMetricsCollector();
  const lagThresholdSeconds = options.lagThresholdSeconds ?? REPLICA_LAG_THRESHOLD_SECONDS;
  let replicaHealthy = true;
  let fallbackReason: string | undefined;
  let fallbackGeneration = 0;

  const usePrimary = (reason: string): void => {
    if (replicaHealthy) {
      logger.warn("Read replica fallback activated", { reason });
      metrics.increment("database_replica_fallback_total", { reason });
      fallbackGeneration += 1;
    }
    replicaHealthy = false;
    fallbackReason = reason;
  };

  const checkReplicaHealth = async (): Promise<void> => {
    const generation = fallbackGeneration;
    try {
      const result = await replica.$queryRaw<Array<{ lag_seconds: number | null }>>`
        SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) AS lag_seconds
      `;
      const lagSeconds = result[0]?.lag_seconds;
      if (lagSeconds == null || Number(lagSeconds) > lagThresholdSeconds) {
        usePrimary("replication_lag");
        return;
      }
      if (generation !== fallbackGeneration) return;
      if (!replicaHealthy) {
        logger.info("Read replica recovered", { previousFallbackReason: fallbackReason });
      }
      replicaHealthy = true;
      fallbackReason = undefined;
    } catch {
      usePrimary("replica_connection_error");
    }
  };

  const intervalMs = options.healthCheckIntervalMs ?? REPLICA_HEALTH_CHECK_INTERVAL_MS;
  if (intervalMs > 0) {
    const timer = setInterval(() => void checkReplicaHealth(), intervalMs);
    timer.unref();
    void checkReplicaHealth();
  }

  const client = new Proxy(primary, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof property === "symbol" || typeof value !== "object" || value === null) {
        return typeof value === "function" ? value.bind(target) : value;
      }

      const model = String(property);
      return new Proxy(value as DynamicClient, {
        get(delegate, operation, delegateReceiver) {
          const method = Reflect.get(delegate, operation, delegateReceiver) as unknown;
          if (typeof operation !== "string" || typeof method !== "function") return method;
          if (!READ_OPERATIONS.has(operation)) return method.bind(delegate);

          return async (...args: unknown[]) => {
            if (!replicaHealthy) {
              const primaryDelegate = Reflect.get(primary, model) as DynamicClient;
              return (primaryDelegate[operation] as (...values: unknown[]) => unknown)(...args);
            }

            try {
              const replicaDelegate = Reflect.get(replica, model) as DynamicClient;
              return await (replicaDelegate[operation] as (...values: unknown[]) => unknown)(...args);
            } catch {
              usePrimary("replica_connection_error");
              const primaryDelegate = Reflect.get(primary, model) as DynamicClient;
              return (primaryDelegate[operation] as (...values: unknown[]) => unknown)(...args);
            }
          };
        },
      });
    },
  });

  return { client: client as T, checkReplicaHealth };
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  replicaPrisma?: PrismaClient;
};

const primaryUrl = process.env.DATABASE_URL;
const primaryPoolLimit = process.env.NODE_ENV === "production" ? 10 : 5;
const primary = globalForPrisma.prisma ?? new PrismaClient(
  primaryUrl
    ? { datasources: { db: { url: withConnectionLimit(primaryUrl, primaryPoolLimit) } } }
    : undefined,
);

if (!process.env.NODE_ENV || process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = primary;
}

const replicaUrl = process.env.DATABASE_REPLICA_URL;
let prisma = primary;

if (replicaUrl) {
  const replicaPoolLimit = Number.parseInt(process.env.DATABASE_REPLICA_CONNECTION_LIMIT ?? "5", 10);
  const replica = globalForPrisma.replicaPrisma ?? new PrismaClient({
    datasources: {
      db: { url: withConnectionLimit(replicaUrl, replicaPoolLimit) },
    },
  });
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== "production") {
    globalForPrisma.replicaPrisma = replica;
  }
  prisma = createReadReplicaClient(primary, replica).client;
}

export { prisma };