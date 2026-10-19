import {
  getConnectionPoolLimit,
  renderDatabasePoolMetrics,
  readDatabasePoolSnapshot,
  resetPoolSaturationWarningsForTests,
  warnOnPoolSaturation,
} from "../prismaPoolMetrics";
import type { Logger } from "../../types/logging.types";

describe("Prisma pool metrics", () => {
  afterEach(() => {
    resetPoolSaturationWarningsForTests();
  });

  it("reads active, idle, and queue wait stats from Prisma metrics", async () => {
    const client = {
      $metrics: {
        json: jest.fn().mockResolvedValue({
          gauges: [
            { key: "prisma_pool_connections_busy", value: 9 },
            { key: "prisma_pool_connections_idle", value: 1 },
          ],
          histograms: [
            {
              key: "prisma_pool_connections_wait_histogram_ms",
              value: { count: 4, sum: 20 },
            },
          ],
        }),
      },
    };

    await expect(readDatabasePoolSnapshot(client, "primary", 10)).resolves.toEqual({
      pool: "primary",
      activeConnections: 9,
      idleConnections: 1,
      maxConnections: 10,
      utilization: 0.9,
      queueWaitDurationMs: 5,
    });
  });

  it("uses the configured connection_limit when present", () => {
    expect(getConnectionPoolLimit(
      "postgresql://localhost/fluxapay?connection_limit=24",
      10,
    )).toBe(24);
    expect(getConnectionPoolLimit("postgresql://localhost/fluxapay", 10)).toBe(10);
  });

  it("renders pool metrics as Prometheus gauge families", () => {
    const output = renderDatabasePoolMetrics([{
      pool: "primary",
      activeConnections: 9,
      idleConnections: 1,
      maxConnections: 10,
      utilization: 0.9,
      queueWaitDurationMs: 12.5,
    }]);

    expect(output).toContain("# TYPE fluxapay_database_pool_connections_active gauge");
    expect(output).toContain('fluxapay_database_pool_connections_active{pool="primary"} 9');
    expect(output).toContain('fluxapay_database_pool_connections_idle{pool="primary"} 1');
    expect(output).toContain('fluxapay_database_pool_utilization_ratio{pool="primary"} 0.9');
    expect(output).toContain('fluxapay_database_pool_queue_wait_duration_ms{pool="primary"} 12.5');
    for (const line of output.trim().split("\n")) {
      if (!line.startsWith("#")) {
        expect(line).toMatch(/^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? -?[0-9.eE+-]+$/);
      }
    }
  });

  it("warns above 80% utilization and throttles repeated warnings", () => {
    const logger = { warn: jest.fn() } as unknown as Logger;
    const snapshot = {
      pool: "primary",
      activeConnections: 9,
      idleConnections: 1,
      maxConnections: 10,
      utilization: 0.9,
      queueWaitDurationMs: 5,
    };

    expect(warnOnPoolSaturation(snapshot, logger, 100_000)).toBe(true);
    expect(warnOnPoolSaturation(snapshot, logger, 100_001)).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "Database connection pool utilization is above 80%",
      expect.objectContaining({ utilization: 0.9 }),
    );
  });
});