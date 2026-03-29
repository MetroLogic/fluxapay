import dotenv from "dotenv";
import { validateEnv, EnvValidationError } from "./config/env.config";
import { startCronJobs } from "./services/cron.service";
import { startPaymentMonitor } from "./services/paymentMonitor.service";
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

    // Start payment monitor loop
    startPaymentMonitor();
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Graceful shutdown initiated (${signal})`);

    try {
      // Stop accepting new requests
      server.close();

      // Close Prisma connections
      await prisma.$disconnect();
      logger.info("Database connections closed");

      // Give existing requests time to complete
      setTimeout(() => {
        logger.info("Forcing shutdown after timeout");
        process.exit(1);
      }, 30000); // 30 second timeout

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
