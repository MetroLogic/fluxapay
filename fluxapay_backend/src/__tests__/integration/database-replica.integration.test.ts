import { PrismaClient } from "../../generated/client/client";
import { InMemoryMetricsCollector } from "../../utils/logger";
import { createReadReplicaClient } from "../../config/database";

describe("read replica disconnect fallback", () => {
  it("retries failed reads on primary and keeps writes on primary", async () => {
    const primaryRead = jest.fn().mockResolvedValue([{ id: "primary" }]);
    const primaryWrite = jest.fn().mockResolvedValue({ count: 0 });
    const replicaRead = jest.fn().mockRejectedValue(new Error("connection terminated"));
    const primary = {
      payment: { findMany: primaryRead, deleteMany: primaryWrite },
    } as unknown as PrismaClient;
    const replica = {
      payment: { findMany: replicaRead, deleteMany: jest.fn() },
    } as unknown as PrismaClient;
    const metrics = new InMemoryMetricsCollector();
    const logger = { warn: jest.fn(), info: jest.fn() } as any;
    const { client } = createReadReplicaClient(primary, replica, {
      logger,
      metrics,
      healthCheckIntervalMs: 0,
    });

    await expect(client.payment.findMany()).resolves.toEqual([{ id: "primary" }]);
    await expect(client.payment.findMany()).resolves.toEqual([{ id: "primary" }]);
    await expect(client.payment.deleteMany()).resolves.toEqual({ count: 0 });

    expect(replicaRead).toHaveBeenCalledTimes(1);
    expect(primaryRead).toHaveBeenCalledTimes(2);
    expect(primaryWrite).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(metrics.getMetrics()).toHaveLength(1);
    expect(metrics.getMetrics()[0]).toEqual(
      expect.objectContaining({
        name: "database_replica_fallback_total",
        tags: { reason: "replica_connection_error" },
      }),
    );
  });

  it("does not let a stale health check re-enable a disconnected replica", async () => {
    let resolveHealthCheck!: (rows: Array<{ lag_seconds: number }>) => void;
    const primaryRead = jest.fn().mockResolvedValue([{ id: "primary" }]);
    const replicaRead = jest.fn().mockRejectedValue(new Error("connection terminated"));
    const primary = {
      payment: { findMany: primaryRead },
    } as unknown as PrismaClient;
    const replica = {
      payment: { findMany: replicaRead },
      $queryRaw: jest.fn().mockImplementation(
        () => new Promise((resolve) => { resolveHealthCheck = resolve; }),
      ),
    } as unknown as PrismaClient;
    const { client, checkReplicaHealth } = createReadReplicaClient(primary, replica, {
      logger: { warn: jest.fn(), info: jest.fn() } as any,
      metrics: new InMemoryMetricsCollector(),
      healthCheckIntervalMs: 0,
    });

    const healthCheck = checkReplicaHealth();
    await expect(client.payment.findMany()).resolves.toEqual([{ id: "primary" }]);
    resolveHealthCheck([{ lag_seconds: 0 }]);
    await healthCheck;
    await expect(client.payment.findMany()).resolves.toEqual([{ id: "primary" }]);

    expect(replicaRead).toHaveBeenCalledTimes(1);
    expect(primaryRead).toHaveBeenCalledTimes(2);
  });
});