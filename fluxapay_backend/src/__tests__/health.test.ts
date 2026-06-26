import request from "supertest";
import express from "express";
import { PrismaClient } from "../generated/client/client";
import { createHealthRouter } from "../routes/health.route";
import {
  checkDatabase,
  checkHorizon,
  checkRedis,
  DEPENDENCY_TIMEOUT_MS,
  getReadiness,
  getUptimeSeconds,
} from "../services/health.service";
import {
  getRedisClient,
  resetRedisClientForTests,
  setRedisClientForTests,
} from "../sms/otpSmsRateLimiter";

jest.mock("../generated/client/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
  })),
}));

function buildHealthApp(prisma: PrismaClient) {
  const app = express();
  app.use("/health", createHealthRouter(prisma));
  return app;
}

describe("health.service", () => {
  const prisma = new PrismaClient();

  beforeEach(() => {
    jest.clearAllMocks();
    resetRedisClientForTests();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    resetRedisClientForTests();
    jest.restoreAllMocks();
  });

  describe("getUptimeSeconds", () => {
    it("returns a non-negative integer", () => {
      expect(getUptimeSeconds()).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(getUptimeSeconds())).toBe(true);
    });
  });

  describe("checkDatabase", () => {
    it("reports up when SELECT 1 succeeds", async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ "?column?": 1 }]);

      const result = await checkDatabase(prisma);

      expect(result.status).toBe("up");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("reports down when the query fails", async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error("db down"));

      const result = await checkDatabase(prisma);

      expect(result.status).toBe("down");
    });
  });

  describe("checkRedis", () => {
    it("reports up when ping returns PONG", async () => {
      setRedisClientForTests({
        ping: jest.fn().mockResolvedValue("PONG"),
      } as unknown as ReturnType<typeof getRedisClient>);

      const result = await checkRedis();

      expect(result.status).toBe("up");
    });

    it("reports down when ping fails", async () => {
      setRedisClientForTests({
        ping: jest.fn().mockRejectedValue(new Error("redis down")),
      } as unknown as ReturnType<typeof getRedisClient>);

      const result = await checkRedis();

      expect(result.status).toBe("down");
    });
  });

  describe("checkHorizon", () => {
    it("reports up when Horizon responds with 200", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

      const result = await checkHorizon();

      expect(result.status).toBe("up");
      expect(global.fetch).toHaveBeenCalled();
    });

    it("reports down when Horizon responds with an error status", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

      const result = await checkHorizon();

      expect(result.status).toBe("down");
    });

    it("reports down when the request times out", async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, status: 200 }), DEPENDENCY_TIMEOUT_MS + 50);
          }),
      );

      const result = await checkHorizon();

      expect(result.status).toBe("down");
      expect(result.latencyMs).toBeLessThanOrEqual(DEPENDENCY_TIMEOUT_MS + 50);
    });
  });

  describe("getReadiness", () => {
    it("returns ok when all dependencies are up", async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ "?column?": 1 }]);
      setRedisClientForTests({
        ping: jest.fn().mockResolvedValue("PONG"),
      } as unknown as ReturnType<typeof getRedisClient>);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

      const result = await getReadiness(prisma);

      expect(result.status).toBe("ok");
      expect(result.dependencies.database.status).toBe("up");
      expect(result.dependencies.redis.status).toBe("up");
      expect(result.dependencies.horizon.status).toBe("up");
    });

    it("returns degraded when any dependency is down", async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error("db down"));
      setRedisClientForTests({
        ping: jest.fn().mockResolvedValue("PONG"),
      } as unknown as ReturnType<typeof getRedisClient>);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

      const result = await getReadiness(prisma);

      expect(result.status).toBe("degraded");
      expect(result.dependencies.database.status).toBe("down");
      expect(result.dependencies.redis.status).toBe("up");
      expect(result.dependencies.horizon.status).toBe("up");
    });
  });
});

describe("health routes", () => {
  const prisma = new PrismaClient();

  beforeEach(() => {
    jest.clearAllMocks();
    resetRedisClientForTests();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    resetRedisClientForTests();
    jest.restoreAllMocks();
  });

  it("GET /health returns status ok and uptime without auth", async () => {
    const app = buildHealthApp(prisma);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      uptime: expect.any(Number),
    });
  });

  it("GET /health/ready returns 200 when all dependencies are up", async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ "?column?": 1 }]);
    setRedisClientForTests({
      ping: jest.fn().mockResolvedValue("PONG"),
    } as unknown as ReturnType<typeof getRedisClient>);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    const app = buildHealthApp(prisma);
    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.dependencies).toMatchObject({
      database: { status: "up", latencyMs: expect.any(Number) },
      redis: { status: "up", latencyMs: expect.any(Number) },
      horizon: { status: "up", latencyMs: expect.any(Number) },
    });
  });

  it("GET /health/ready returns 503 when a dependency is down", async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error("db down"));
    setRedisClientForTests({
      ping: jest.fn().mockResolvedValue("PONG"),
    } as unknown as ReturnType<typeof getRedisClient>);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    const app = buildHealthApp(prisma);
    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("degraded");
    expect(response.body.dependencies.database.status).toBe("down");
  });
});
