// OTEL must be imported first so auto-instrumentation patches load before any
// application modules are required.
import "./tracing";

import dotenv from "dotenv";
import { validateEnv, EnvValidationError } from "./config/env.config";
import { startCronJobs, stopCronJobs } from "./services/cron.service";
import { startPaymentMonitor, stopPaymentMonitor } from "./services/paymentMonitor.service";
import { initializeEmailNotifications } from "./services/emailNotification.service";
import { getLogger } from "./utils/logger";

dotenv.config();

const logger = getLogger();

// Validate environment variables on startup (fail fast)
let config;
try {
  config = validateEnv();
} catch (error) {
  if (error instanceof EnvValidationError) {
    logger.error("Environment validation failed", {
      error: { message: error.message },
    });
  } else {
    logger.error("Failed to validate environment", { error });
  }
  process.exit(1);
}

import { app, prisma } from "./app";

let server: any;
// Track whether a shutdown is already in progress to avoid duplicate calls.
let isShuttingDown = false;

try {
  server = app.listen(config.PORT, () => {
    logger.info("Server started", {
      port: config.PORT,
      environment: process.env.NODE_ENV || "development",
      version: process.env.npm_package_version || "1.0.0",
    });
    logger.info(
      `Swagger docs available at http://localhost:${config.PORT}/api-docs`,
    );

    // Start scheduled jobs (daily settlement batch, etc.)
    startCronJobs();

    // Start payment monitor loop
    startPaymentMonitor();

    // Initialize email notification listeners
    initializeEmailNotifications();
  });

  /**
   * Graceful shutdown handler.
   *
   * Sequence:
   *  1. Stop cron workers and payment monitor (no new background work).
   *  2. Stop the HTTP server so no new connections are accepted.
   *  3. Wait for in-flight requests to finish (server.close callback).
   *  4. Disconnect Prisma.
   *  5. Exit 0.
   *
   * A hard-kill timer fires after SHUTDOWN_TIMEOUT_MS (default 30 s) to
   * ensure the process always terminates even when a request hangs.
   *
   * Kubernetes preStop hook recommendation
   * ───────────────────────────────────────
   * Add the following to your container spec so the kubelet sends SIGTERM
   * *after* the pod is removed from the load-balancer endpoints, giving
   * existing connections time to drain:
   *
   *   lifecycle:
   *     preStop:
   *       exec:
   *         command: ["sleep", "5"]
   *
   * Set `terminationGracePeriodSeconds` to at least SHUTDOWN_TIMEOUT_MS / 1000
   * plus the preStop sleep (e.g. 35 s for a 30 s drain + 5 s preStop).
   */
  const SHUTDOWN_TIMEOUT_MS = parseInt(
    process.env.SHUTDOWN_TIMEOUT_MS || "30000",
    10,
  );

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Graceful shutdown initiated (${signal})`);

    // Arm the hard-kill timer FIRST so we always exit even if cleanup hangs.
    const forceExitTimer = setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // Allow Node to exit normally once cleanup finishes (don't keep the loop alive).
    forceExitTimer.unref();

    try {
      // 1. Stop background workers — no new cron ticks or monitor polls.
      stopCronJobs();
      stopPaymentMonitor();
      logger.info("Background workers stopped");

      // 2. Stop accepting new HTTP connections; wait for in-flight requests.
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) return reject(err);
          resolve();
        });
      });
      logger.info("HTTP server closed — all in-flight requests finished");

      // 3. Disconnect from the database.
      await prisma.$disconnect();
      logger.info("Database connections closed");

      clearTimeout(forceExitTimer);
      logger.info("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.error("Error during graceful shutdown", { error });
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
      error: { name: error.name, message: error.message, stack: error.stack },
    });
    gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason });
    gracefulShutdown("unhandledRejection");
  });
} catch (error) {
  logger.error("Failed to start server", { error });
  process.exit(1);
}
