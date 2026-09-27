/**
 * Graceful Shutdown Tests
 *
 * Tests gracefulShutdown() and registerShutdownHandlers() from shutdown.service.ts.
 *
 * Shutdown sequence verified:
 *   1. Stop cron jobs and payment oracle (no new background work)
 *   2. Close the HTTP server (drain in-flight requests)
 *   3. Run registered cleanup callbacks (close Redis clients)
 *   4. Disconnect Prisma
 *   5. Exit 0
 *
 * Edge cases:
 *   - Duplicate signals are ignored (isShuttingDown guard)
 *   - Hard-kill timer fires when cleanup hangs past timeoutMs
 *   - server.close errors → exit 1
 *   - Prisma disconnect errors → exit 1
 *   - uncaughtException / unhandledRejection trigger shutdown
 *   - Background workers are stopped before server.close
 *
 * No database or network required — all I/O is mocked.
 */

jest.mock("../services/cron.service", () => ({
    startCronJobs: jest.fn(),
    stopCronJobs: jest.fn(),
}));

jest.mock("../services/paymentMonitor.service", () => ({
    startPaymentMonitor: jest.fn(),
    stopPaymentMonitor: jest.fn(),
}));

jest.mock("../services/paymentOracle.service", () => ({
    startPaymentOracle: jest.fn(),
    stopPaymentOracle: jest.fn(),
}));

jest.mock("../middleware/redisIdempotency.middleware", () => ({
    closeIdempotencyRedisClient: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../middleware/rateLimit.middleware", () => ({
    closeRateLimitRedisClient: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../sms/otpSmsRateLimiter", () => ({
    closeOtpRedisClient: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/auth.service", () => ({
    closeAuthRedisClient: jest.fn().mockResolvedValue(undefined),
}));

import {
    clearShutdownCleanupsForTests,
    getRegisteredShutdownCleanups,
    gracefulShutdown,
    registerDefaultShutdownCleanups,
    registerShutdownCleanup,
    registerShutdownHandlers,
} from "../services/shutdown.service";
import { stopCronJobs } from "../services/cron.service";
import { stopPaymentOracle } from "../services/paymentOracle.service";
import { closeIdempotencyRedisClient } from "../middleware/redisIdempotency.middleware";
import { closeRateLimitRedisClient } from "../middleware/rateLimit.middleware";
import { closeOtpRedisClient } from "../sms/otpSmsRateLimiter";
import { closeAuthRedisClient } from "../services/auth.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockServer(opts: { closeError?: Error } = {}) {
    return {
        close: jest.fn((cb?: (err?: Error) => void) => {
            if (cb) cb(opts.closeError);
        }),
    };
}

function makeMockPrisma(opts: { rejectWith?: Error } = {}) {
    return {
        $disconnect: opts.rejectWith
            ? jest.fn().mockRejectedValue(opts.rejectWith)
            : jest.fn().mockResolvedValue(undefined),
    };
}

/** Drains pending microtasks so async shutdown steps can settle under fake timers. */
async function flushPromises(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

// ── gracefulShutdown() ────────────────────────────────────────────────────────

describe("gracefulShutdown()", () => {
    let exitSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.useFakeTimers();
        exitSpy = jest
            .spyOn(process, "exit")
            .mockImplementation(() => undefined as never);
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
        exitSpy.mockRestore();
    });

    it("stops cron, stops oracle, closes server, disconnects prisma, exits 0", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        await gracefulShutdown("SIGTERM", { server: server as any, prisma });

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(stopPaymentOracle).toHaveBeenCalledTimes(1);
        expect(server.close).toHaveBeenCalledTimes(1);
        expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("closes every Redis client on shutdown", async () => {
        await gracefulShutdown("SIGTERM", { server: makeMockServer() as any, prisma: makeMockPrisma() });

        expect(closeIdempotencyRedisClient).toHaveBeenCalledTimes(1);
        expect(closeRateLimitRedisClient).toHaveBeenCalledTimes(1);
        expect(closeOtpRedisClient).toHaveBeenCalledTimes(1);
        expect(closeAuthRedisClient).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("runs cleanups after the HTTP server drains and before Prisma disconnects", async () => {
        const callOrder: string[] = [];
        (closeIdempotencyRedisClient as jest.Mock).mockImplementationOnce(async () => {
            callOrder.push("redis");
        });

        const server = {
            close: jest.fn((cb?: (err?: Error) => void) => {
                callOrder.push("server.close");
                if (cb) cb();
            }),
        };
        const prisma = {
            $disconnect: jest.fn(async () => {
                callOrder.push("prisma.$disconnect");
            }),
        };

        await gracefulShutdown("SIGTERM", { server: server as any, prisma });

        expect(callOrder).toEqual(["server.close", "redis", "prisma.$disconnect"]);
    });

    it("still disconnects Prisma and exits 0 when a cleanup callback fails", async () => {
        (closeRateLimitRedisClient as jest.Mock).mockRejectedValueOnce(new Error("redis down"));
        const prisma = makeMockPrisma();

        await gracefulShutdown("SIGTERM", { server: makeMockServer() as any, prisma });

        expect(closeIdempotencyRedisClient).toHaveBeenCalledTimes(1);
        expect(closeOtpRedisClient).toHaveBeenCalledTimes(1);
        expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("stops background workers before closing the HTTP server", async () => {
        const callOrder: string[] = [];

        (stopCronJobs as jest.Mock).mockImplementation(() => callOrder.push("stopCronJobs"));
        (stopPaymentOracle as jest.Mock).mockImplementation(() => callOrder.push("stopPaymentOracle"));

        const server = {
            close: jest.fn((cb?: (err?: Error) => void) => {
                callOrder.push("server.close");
                if (cb) cb();
            }),
        };

        await gracefulShutdown("SIGTERM", { server: server as any, prisma: makeMockPrisma() });

        expect(callOrder).toEqual(["stopCronJobs", "stopPaymentOracle", "server.close"]);
    });

    it("exits with code 1 when server.close returns an error", async () => {
        const server = makeMockServer({ closeError: new Error("close failed") });
        const prisma = makeMockPrisma();

        await gracefulShutdown("SIGTERM", { server: server as any, prisma });

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(prisma.$disconnect).not.toHaveBeenCalled();
    });

    it("exits with code 1 when prisma.$disconnect rejects", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma({ rejectWith: new Error("db disconnect failed") });

        await gracefulShutdown("SIGTERM", { server: server as any, prisma });

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("force-exits with code 1 when shutdown exceeds timeoutMs", () => {
        const server = { close: jest.fn() }; // never calls callback
        const prisma = makeMockPrisma();

        gracefulShutdown("SIGTERM", { server: server as any, prisma, timeoutMs: 5000 });

        jest.advanceTimersByTime(6000);

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("clears the hard-kill timer after a clean shutdown", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        await gracefulShutdown("SIGTERM", { server: server as any, prisma, timeoutMs: 5000 });

        jest.advanceTimersByTime(10000); // well past timeout

        // exit called exactly once with 0 — timer did not fire again
        expect(exitSpy).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("works identically for SIGINT", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        await gracefulShutdown("SIGINT", { server: server as any, prisma });

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });
});

// ── registerShutdownHandlers() ────────────────────────────────────────────────

describe("registerShutdownHandlers()", () => {
    let exitSpy: jest.SpyInstance;
    // Track listeners we add so we can clean them up
    const cleanup: Array<() => void> = [];

    beforeEach(() => {
        jest.useFakeTimers();
        exitSpy = jest
            .spyOn(process, "exit")
            .mockImplementation(() => undefined as never);
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
        exitSpy.mockRestore();
        // Remove all listeners registered during this test
        cleanup.forEach((fn) => fn());
        cleanup.length = 0;
    });

    /** Registers handlers and records how to remove them afterwards. */
    function register(server: any, prisma: any) {
        const events = ["SIGTERM", "SIGINT", "uncaughtException", "unhandledRejection"] as const;
        const before = Object.fromEntries(events.map((e) => [e, process.listenerCount(e)]));

        registerShutdownHandlers({ server, prisma });

        // Schedule removal of the newly added listeners
        for (const event of events) {
            const added = process.listenerCount(event) - before[event];
            if (added > 0) {
                const listeners = process.rawListeners(event).slice(-added);
                cleanup.push(() => {
                    for (const l of listeners) process.removeListener(event, l as any);
                });
            }
        }
    }

    it("triggers shutdown on SIGTERM", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        register(server, prisma);
        process.emit("SIGTERM");

        await flushPromises();

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("triggers shutdown on SIGINT", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        register(server, prisma);
        process.emit("SIGINT");

        await flushPromises();

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("ignores a second SIGTERM while shutdown is already in progress", async () => {
        const server = { close: jest.fn() }; // never resolves
        const prisma = makeMockPrisma();

        register(server, prisma);

        process.emit("SIGTERM");
        process.emit("SIGTERM"); // duplicate

        await Promise.resolve();

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
    });

    it("triggers shutdown on uncaughtException", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        register(server, prisma);
        process.emit("uncaughtException", new Error("boom"));

        await flushPromises();

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("triggers shutdown on unhandledRejection", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        register(server, prisma);
        process.emit("unhandledRejection", new Error("unhandled"), Promise.resolve());

        await flushPromises();

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });
});

// ── registerShutdownCleanup() ─────────────────────────────────────────────────

describe("registerShutdownCleanup()", () => {
    let exitSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.useFakeTimers();
        exitSpy = jest
            .spyOn(process, "exit")
            .mockImplementation(() => undefined as never);
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
        exitSpy.mockRestore();
        clearShutdownCleanupsForTests();
        registerDefaultShutdownCleanups();
    });

    it("registers the Redis cleanups by default", () => {
        expect(getRegisteredShutdownCleanups()).toEqual(
            expect.arrayContaining(["redis:idempotency", "redis:rate-limit", "redis:otp", "redis:auth"]),
        );
    });

    it("runs custom callbacks during shutdown", async () => {
        const custom = jest.fn().mockResolvedValue(undefined);
        registerShutdownCleanup("custom:stream", custom);

        await gracefulShutdown("SIGTERM", { server: makeMockServer() as any, prisma: makeMockPrisma() });

        expect(custom).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("replaces a callback registered under the same name", async () => {
        const first = jest.fn();
        const second = jest.fn();
        registerShutdownCleanup("custom", first);
        registerShutdownCleanup("custom", second);

        await gracefulShutdown("SIGTERM", { server: makeMockServer() as any, prisma: makeMockPrisma() });

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });
});
