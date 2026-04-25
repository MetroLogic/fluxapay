/**
 * Oracle Controller
 * 
 * Admin endpoints for monitoring and managing the payment oracle service
 */

import { Request, Response } from "express";
import {
  getOracleMetrics,
  getOracleHealth,
  manualVerifyPayment,
} from "../services/paymentOracle.service";
import { getLogger } from "../utils/logger";

const logger = getLogger("OracleController");

/**
 * GET /admin/oracle/metrics
 * Returns current oracle performance metrics
 */
export async function getMetrics(req: Request, res: Response): Promise<void> {
  try {
    const metrics = getOracleMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    logger.error("Failed to get oracle metrics", { error: error.message });
    res.status(500).json({
      success: false,
      error: "Failed to retrieve oracle metrics",
    });
  }
}

/**
 * GET /admin/oracle/health
 * Returns oracle health status
 */
export async function getHealth(req: Request, res: Response): Promise<void> {
  try {
    const health = getOracleHealth();
    const statusCode = health.isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.isHealthy,
      data: health,
    });
  } catch (error: any) {
    logger.error("Failed to get oracle health", { error: error.message });
    res.status(500).json({
      success: false,
      error: "Failed to retrieve oracle health",
    });
  }
}

/**
 * POST /admin/oracle/verify/:paymentId
 * Manually triggers payment verification
 */
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  try {
    const paymentId = req.params.paymentId as string;

    if (!paymentId || Array.isArray(paymentId)) {
      res.status(400).json({
        success: false,
        error: "Payment ID is required",
      });
      return;
    }

    logger.info("Manual payment verification triggered", {
      paymentId,
      adminId: (req as any).user?.id,
    });

    const verification = await manualVerifyPayment(paymentId);

    res.json({
      success: true,
      data: verification,
    });
  } catch (error: any) {
    const paymentId = req.params.paymentId as string;
    logger.error("Manual payment verification failed", {
      paymentId,
      error: error.message,
    });
    
    if (error.message.includes("not found")) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Payment verification failed",
      });
    }
  }
}
