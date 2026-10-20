import { PrismaClient } from "../../generated/client/client";
import { InMemoryMetricsCollector } from "../../utils/logger";
import { createReadReplicaClient } from "../database";

describe("read replica health routing", () => {
  it("retries a failed replica read on primary and records fallback telemetry", async () => {
    const primaryRead = jest.fn().mockResolvedValue([{ id: "primary" }]);
    const replicaRead = jest.fn().mockRejectedValue(new Error("connection terminated"));
    const primary = {
      payment: { findMany: primaryRead },
    } as unknown as PrismaClient;
    const replica = {
      payment: { findMany: replicaRead },
    } as unknown as PrismaClient;
    const metrics = new InMemoryMetricsCollector();
    const logger = { warn: jest.fn(), info: jest.fn() } as any;
    const { client } = createReadReplicaClient(primary, replica, {
      logger,
      metrics,
      healthCheckIntervalMs: 0,
    });

    await expect(client.payment.findMany()).resolves.toEqual([{ id: "primary" }]);

    expect(replicaRead).toHaveBeenCalledTimes(1);
    expect(primaryRead).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("Read replica fallback activated", {
      reason: "replica_connection_error",
    });
    expect(metrics.getMetrics()).toEqual([
      expect.objectContaining({
        name: "database_replica_fallback_total",
        tags: { reason: "replica_connection_error" },
      }),
    ]);
  });

  it("routes reads to primary when replication lag exceeds 30 seconds", async () => {
    const primaryRead = jest.fn().mockResolvedValue([{ id: "primary" }]);
    const replicaRead = jest.fn().mockResolvedValue([{ id: "replica" }]);
    const primary = {
      payment: { findMany: primaryRead },
    } as unknown as PrismaClient;
    const replica = {
      payment: { findMany: replicaRead },
      $queryRaw: jest.fn().mockResolvedValue([{ lag_seconds: 31 }]),
    } as unknown as PrismaClient;
    const metrics = new InMemoryMetricsCollector();
    const logger = { warn: jest.fn(), info: jest.fn() } as any;
    const { client, checkReplicaHealth } = createReadReplicaClient(primary, replica, {
      logger,
      metrics,
      healthCheckIntervalMs: 0,
    });

    await checkReplicaHealth();
    const rows = await client.payment.findMany();

    expect(rows).toEqual([{ id: "primary" }]);
    expect(primaryRead).toHaveBeenCalledTimes(1);
    expect(replicaRead).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Read replica fallback activated", {
      reason: "replication_lag",
    });
    expect(metrics.getMetrics()).toEqual([
      expect.objectContaining({
        name: "database_replica_fallback_total",
        type: "counter",
        tags: { reason: "replication_lag" },
      }),
    ]);
  });
});