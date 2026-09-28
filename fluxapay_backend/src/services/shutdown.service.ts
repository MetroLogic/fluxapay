import type { Server } from "http";
import type { PrismaClient } from "../generated/client/client";
import { stopCronJobs } from "./cron.service";
import { stopPaymentOracle } from "./paymentOracle.service";
import { getLogger } from "../utils/logger";
import { closeIdempotencyRedisClient } from "../middleware/redisIdempotency.middleware";
import { closeRateLimitRedisClient } from "../middleware/rateLimit.middleware";
import { closeOtpRedisClient } from "../sms/otpSmsRateLimiter";
import { closeAuthRedisClient } from "./auth.service";

const logger = getLogger();

export type ShutdownCleanup = () => void | Promise<void>;

/**
 * Named cleanup callbacks run during graceful shutdown, after the HTTP server
 * has drained and before Prisma disconnects. Use this to close long-lived
 * connections (Redis clients, streams, sockets) so deployments don't leave
 * dangling sockets or held locks behind.
 */
const cleanupCallbacks = new Map<string, ShutdownCleanup>();

/** Registers (or replaces) a named cleanup callback to run on shutdown. */
export function registerShutdownCleanup(name: string, fn: ShutdownCleanup): void {
    cleanupCallbacks.set(name, fn);
}

/** Names of the currently registered cleanup callbacks, in run order. */
export function getRegisteredShutdownCleanups(): string[] {
    return [...cleanupCallbacks.keys()];
}

/** Test-only: removes all registered cleanup callbacks. */
export function clearShutdownCleanupsForTests(): void {
    cleanupCallbacks.clear();
}

/** Registers the built-in cleanups for every Redis client the app opens. */
export function registerDefaultShutdownCleanups(): void {
    registerShutdownCleanup("redis:idempotency", closeIdempotencyRedisClient);
    registerShutdownCleanup("redis:rate-limit", closeRateLimitRedisClient);
    registerShutdownCleanup("redis:otp", closeOtpRedisClient);
    registerShutdownCleanup("redis:auth", closeAuthRedisClient);
}

registerDefaultShutdownCleanups();

/**
 * Runs all registered cleanup callbacks concurrently. A failing callback is
 * logged but never prevents the others (or the rest of shutdown) from running.
 */
async function runShutdownCleanups(): Promise<void> {
    const entries = [...cleanupCallbacks.entries()];
    const results = await Promise.allSettled(entries.map(([, fn]) => Promise.resolve().then(fn)));

    results.forEach((result, i) => {
        const name = entries[i][0];
        if (result.status === "rejected") {
            logger.error(`Shutdown cleanup "${name}" failed`, { error: result.reason });
        }
    });
    logger.info("Shutdown cleanups completed", { count: entries.length });
}

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
 *  2. Stop the payment oracle and its Horizon poller (no new polling)
 *  3. Close the HTTP server (stop accepting connections; drain in-flight requests)
 *  4. Run registered cleanup callbacks (close Redis clients, etc.)
 *  5. Disconnect Prisma
 *  6. Exit 0
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
        // 1 & 2. Stop background workers — no new cron ticks or Oracle polls.
        stopCronJobs();
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

        // 4. Close long-lived connections (Redis, streams) now that no
        //    request or background worker can still be using them.
        await runShutdownCleanups();

        // 5. Disconnect from the database.
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
