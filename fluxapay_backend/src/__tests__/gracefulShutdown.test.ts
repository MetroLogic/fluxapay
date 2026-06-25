/**
 * Graceful Shutdown Tests
 *
 * Tests gracefulShutdown() and registerShutdownHandlers() from shutdown.service.ts.
 *
 * Shutdown sequence verified:
 *   1. Stop cron jobs
 *   2. Stop the payment monitor
 *   3. Close the HTTP server (drain in-flight requests)
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

import { gracefulShutdown, registerShutdownHandlers } from "../services/shutdown.service";
import { stopCronJobs } from "../services/cron.service";
import { stopPaymentMonitor } from "../services/paymentMonitor.service";

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

    it("stops cron, stops monitor, closes server, disconnects prisma, exits 0", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        await gracefulShutdown("SIGTERM", { server: server as any, prisma });

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(stopPaymentMonitor).toHaveBeenCalledTimes(1);
        expect(server.close).toHaveBeenCalledTimes(1);
        expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("stops background workers before closing the HTTP server", async () => {
        const callOrder: string[] = [];

        (stopCronJobs as jest.Mock).mockImplementation(() => callOrder.push("stopCronJobs"));
        (stopPaymentMonitor as jest.Mock).mockImplementation(() => callOrder.push("stopPaymentMonitor"));

        const server = {
            close: jest.fn((cb?: (err?: Error) => void) => {
                callOrder.push("server.close");
                if (cb) cb();
            }),
        };

        await gracefulShutdown("SIGTERM", { server: server as any, prisma: makeMockPrisma() });

        expect(callOrder).toEqual(["stopCronJobs", "stopPaymentMonitor", "server.close"]);
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

        await Promise.resolve();
        await Promise.resolve();

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("triggers shutdown on SIGINT", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        register(server, prisma);
        process.emit("SIGINT");

        await Promise.resolve();
        await Promise.resolve();

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

        await Promise.resolve();
        await Promise.resolve();

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("triggers shutdown on unhandledRejection", async () => {
        const server = makeMockServer();
        const prisma = makeMockPrisma();

        register(server, prisma);
        process.emit("unhandledRejection", new Error("unhandled"), Promise.resolve());

        await Promise.resolve();
        await Promise.resolve();

        expect(stopCronJobs).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });
});
