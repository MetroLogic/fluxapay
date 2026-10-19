import { getLogger } from "./logger";
import type { Logger } from "../types/logging.types";

export const POOL_SATURATION_THRESHOLD = 0.8;
const WARNING_COOLDOWN_MS = 60_000;

export interface PrismaMetricHistogram {
  count: number;
  sum: number;
}

export interface PrismaMetricsSnapshot {
  gauges?: Array<{ key: string; value: number }>;
  histograms?: Array<{ key: string; value: PrismaMetricHistogram }>;
}

export interface DatabasePoolSnapshot {
  pool: string;
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  utilization: number;
  queueWaitDurationMs: number;
}

export function renderDatabasePoolMetrics(snapshots: DatabasePoolSnapshot[]): string {
  if (snapshots.length === 0) return "";

  const metrics: Array<{
    name: string;
    help: string;
    value: (snapshot: DatabasePoolSnapshot) => number;
  }> = [
    {
      name: "fluxapay_database_pool_connections_active",
      help: "Number of active Prisma database connections.",
      value: (snapshot) => snapshot.activeConnections,
    },
    {
      name: "fluxapay_database_pool_connections_idle",
      help: "Number of idle Prisma database connections.",
      value: (snapshot) => snapshot.idleConnections,
    },
    {
      name: "fluxapay_database_pool_connections_max",
      help: "Configured maximum Prisma database connections.",
      value: (snapshot) => snapshot.maxConnections,
    },
    {
      name: "fluxapay_database_pool_utilization_ratio",
      help: "Fraction of the configured Prisma pool currently active.",
      value: (snapshot) => snapshot.utilization,
    },
    {
      name: "fluxapay_database_pool_queue_wait_duration_ms",
      help: "Average Prisma database pool queue wait duration in milliseconds.",
      value: (snapshot) => snapshot.queueWaitDurationMs,
    },
  ];

  return metrics.flatMap((metric) => [
    `# HELP ${metric.name} ${metric.help}`,
    `# TYPE ${metric.name} gauge`,
    ...snapshots.map(
      (snapshot) => `${metric.name}{pool="${snapshot.pool.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"} ${metric.value(snapshot)}`,
    ),
  ]).join("\n") + "\n";
}

interface PrismaMetricsClient {
  $metrics?: {
    json: () => Promise<PrismaMetricsSnapshot>;
  };
}

const saturationWarningTimes = new Map<string, number>();

export function getConnectionPoolLimit(databaseUrl: string | undefined, defaultLimit: number): number {
  if (!databaseUrl) return defaultLimit;

  const configuredLimit = new URL(databaseUrl).searchParams.get("connection_limit");
  const parsedLimit = configuredLimit ? Number.parseInt(configuredLimit, 10) : defaultLimit;
  return Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : defaultLimit;
}

export function getPrimaryConnectionPoolLimit(): number {
  return getConnectionPoolLimit(
    process.env.DATABASE_URL,
    process.env.NODE_ENV === "production" ? 10 : 5,
  );
}

export function getReplicaConnectionPoolLimit(): number {
  const configuredDefault = Number.parseInt(
    process.env.DATABASE_REPLICA_CONNECTION_LIMIT ?? "5",
    10,
  );
  const defaultLimit = Number.isSafeInteger(configuredDefault) && configuredDefault > 0
    ? configuredDefault
    : 5;
  return getConnectionPoolLimit(process.env.DATABASE_REPLICA_URL, defaultLimit);
}

export async function readDatabasePoolSnapshot(
  client: unknown,
  pool: string,
  maxConnections: number,
): Promise<DatabasePoolSnapshot | undefined> {
  const metricsClient = client as PrismaMetricsClient;
  if (!metricsClient.$metrics?.json) return undefined;

  try {
    const metrics = await metricsClient.$metrics.json();
    const getGauge = (name: string): number =>
      metrics.gauges?.find((metric) => metric.key === name)?.value ?? 0;
    const queueWait = metrics.histograms?.find(
      (metric) => metric.key === "prisma_pool_connections_wait_histogram_ms",
    ) ?? metrics.histograms?.find(
      (metric) => metric.key === "prisma_client_queries_wait_histogram_ms",
    );
    const activeConnections = getGauge("prisma_pool_connections_busy");
    const idleConnections = getGauge("prisma_pool_connections_idle");

    return {
      pool,
      activeConnections,
      idleConnections,
      maxConnections,
      utilization: activeConnections / maxConnections,
      queueWaitDurationMs: queueWait && queueWait.value.count > 0
        ? queueWait.value.sum / queueWait.value.count
        : 0,
    };
  } catch {
    return undefined;
  }
}

export function warnOnPoolSaturation(
  snapshot: DatabasePoolSnapshot,
  logger: Logger = getLogger("DatabasePool"),
  now = Date.now(),
): boolean {
  if (snapshot.utilization <= POOL_SATURATION_THRESHOLD) {
    saturationWarningTimes.delete(snapshot.pool);
    return false;
  }

  const lastWarning = saturationWarningTimes.get(snapshot.pool) ?? 0;
  if (now - lastWarning >= WARNING_COOLDOWN_MS) {
    logger.warn("Database connection pool utilization is above 80%", {
      pool: snapshot.pool,
      activeConnections: snapshot.activeConnections,
      idleConnections: snapshot.idleConnections,
      maxConnections: snapshot.maxConnections,
      utilization: snapshot.utilization,
      threshold: POOL_SATURATION_THRESHOLD,
    });
    saturationWarningTimes.set(snapshot.pool, now);
  }
  return true;
}

export function resetPoolSaturationWarningsForTests(): void {
  saturationWarningTimes.clear();
}