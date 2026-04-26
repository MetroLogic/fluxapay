// OTEL must be imported first so auto-instrumentation patches load before any
// application modules are required.
import "./tracing";

import dotenv from "dotenv";
import { validateEnv, EnvValidationError } from "./config/env.config";
import { startCronJobs } from "./services/cron.service";
import { startPaymentMonitor } from "./services/paymentMonitor.service";
import { startPaymentOracle, stopPaymentOracle } from "./services/paymentOracle.service";
import { initializeEmailNotifications } from "./services/emailNotification.service";
import { registerShutdownHandlers } from "./services/shutdown.service";
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

    // Start payment monitor loop (legacy polling)
    startPaymentMonitor();

    // Start payment oracle service (enhanced monitoring with smart contract verification)
    startPaymentOracle();

    // Initialize email notification listeners
    initializeEmailNotifications();
  });

  /**
   * Register SIGTERM / SIGINT / uncaughtException / unhandledRejection handlers.
   *
   * Shutdown sequence (see shutdown.service.ts for full details):
   *  1. Stop cron jobs and payment monitor (no new background work)
   *  2. Close the HTTP server (drain in-flight requests)
   *  3. Disconnect Prisma
   *  4. Exit 0
   *
   * A hard-kill timer fires after SHUTDOWN_TIMEOUT_MS (default 30 s) to
   * guarantee the process always terminates even when a request hangs.
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
  registerShutdownHandlers({
    server,
    prisma,
    timeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || "30000", 10),
  });
} catch (error) {
  logger.error("Failed to start server", { error });
  process.exit(1);
}
