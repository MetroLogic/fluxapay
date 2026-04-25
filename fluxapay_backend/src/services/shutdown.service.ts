import type { Server } from "http";
import type { PrismaClient } from "../generated/client/client";
import { stopCronJobs } from "./cron.service";
import { stopPaymentMonitor } from "./paymentMonitor.service";
import { stopPaymentOracle } from "./paymentOracle.service";
import { getLogger } from "../utils/logger";

const logger = getLogger();

export interface ShutdownDeps {
    server: Server;
    prisma: Pick<PrismaClient, "$disconnect">;
    /** Milliseconds before the hard-kill timer fires. Default: 30 000. */
    timeoutMs?: number;
}

/**
 * Performs a graceful shutdown in the following order:
 *
 *  1. Stop cron jobs (no new scheduled ticks)
 *  2. Stop the payment monitor (no new polling)
 *  3. Close the HTTP server (stop accepting connections; drain in-flight requests)
 *  4. Disconnect Prisma
 *  5. Exit 0
 *
 * A hard-kill timer fires after `timeoutMs` and exits with code 1 to ensure
 * the process always terminates even when a request hangs.
 *
 * @returns The exit code that will be passed to process.exit (0 = clean, 1 = error).
 *          Useful in tests where process.exit is mocked.
 */
export async function gracefulShutdown(
    signal: string,
    deps: ShutdownDeps,
): Promise<number> {
    const { server, prisma, timeoutMs = 30_000 } = deps;

    logger.info(`Graceful shutdown initiated (${signal})`);

    // Arm the hard-kill timer first so we always exit even if cleanup hangs.
    const forceExitTimer = setTimeout(() => {
        logger.error("Graceful shutdown timed out — forcing exit");
        process.exit(1);
    }, timeoutMs);
    // Don't keep the event loop alive just for this timer.
    forceExitTimer.unref();

    try {
        // 1 & 2. Stop background workers — no new cron ticks or monitor polls.
        stopCronJobs();
        stopPaymentMonitor();
        stopPaymentOracle();
        logger.info("Background workers stopped");

        // 3. Stop accepting new HTTP connections; wait for in-flight requests.
        await new Promise<void>((resolve, reject) => {
            server.close((err?: Error) => {
                if (err) return reject(err);
                resolve();
            });
        });
        logger.info("HTTP server closed — all in-flight requests finished");

        // 4. Disconnect from the database.
        await prisma.$disconnect();
        logger.info("Database connections closed");

        clearTimeout(forceExitTimer);
        logger.info("Graceful shutdown completed");
        process.exit(0);
        return 0;
    } catch (error) {
        logger.error("Error during graceful shutdown", { error });
        process.exit(1);
        return 1;
    }
}

/**
 * Registers SIGTERM, SIGINT, uncaughtException, and unhandledRejection handlers
 * that all delegate to gracefulShutdown().
 *
 * Call once during server startup. The `isShuttingDown` guard prevents duplicate
 * invocations when multiple signals arrive in quick succession.
 */
export function registerShutdownHandlers(deps: ShutdownDeps): void {
    let isShuttingDown = false;

    const handle = (signal: string) => async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        await gracefulShutdown(signal, deps);
    };

    process.on("SIGTERM", handle("SIGTERM"));
    process.on("SIGINT", handle("SIGINT"));

    process.on("uncaughtException", (error) => {
        logger.error("Uncaught exception", {
            error: { name: error.name, message: error.message, stack: error.stack },
        });
        handle("uncaughtException")();
    });

    process.on("unhandledRejection", (reason) => {
        logger.error("Unhandled rejection", { reason });
        handle("unhandledRejection")();
    });
}
