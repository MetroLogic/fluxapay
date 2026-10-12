import { Request, Response } from "express";
import { PrismaClient } from "../generated/client/client";
import { getReadiness, getUptimeSeconds } from "../services/health.service";
import { getFxCircuitBreakerStatus } from "../services/fx.service";

export function createHealthController(prisma: PrismaClient) {
  return {
    getHealth(_req: Request, res: Response): void {
      res.status(200).json({
        status: "ok",
        uptime: getUptimeSeconds(),
        fx_circuit_breaker: getFxCircuitBreakerStatus(),
      });
    },

    async getReady(_req: Request, res: Response): Promise<void> {
      const result = await getReadiness(prisma);
      const statusCode = result.status === "ok" ? 200 : 503;
      res.status(statusCode).json(result);
    },
  };
}
