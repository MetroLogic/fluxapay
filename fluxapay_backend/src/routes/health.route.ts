import { Router } from "express";
import { PrismaClient } from "../generated/client/client";
import { createHealthController } from "../controllers/health.controller";

export function createHealthRouter(prisma: PrismaClient): Router {
  const router = Router();
  const controller = createHealthController(prisma);

  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Shallow health check
   *     description: Returns process liveness for load balancer probes. No authentication required.
   *     responses:
   *       200:
   *         description: Server is up
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: ok
   *                 uptime:
   *                   type: number
   *                   description: Process uptime in seconds
   */
  router.get("/", controller.getHealth);

  /**
   * @swagger
   * /health/ready:
   *   get:
   *     summary: Deep readiness check
   *     description: Verifies database, Redis, and Stellar Horizon connectivity. No authentication required.
   *     responses:
   *       200:
   *         description: All dependencies are available
   *       503:
   *         description: One or more dependencies are unavailable
   */
  router.get("/ready", controller.getReady);

  return router;
}
