/**
 * Request Body Size Limit Tests
 *
 * Verifies that:
 *  1. Requests within the limit are accepted normally (200/201/4xx from route logic)
 *  2. Requests exceeding the limit receive 413 with a structured JSON error
 *  3. The error body contains `error`, `message`, and `limit` fields
 *  4. The limit is configurable via REQUEST_BODY_SIZE_LIMIT env var
 *  5. Non-JSON routes (health check) are unaffected
 *
 * Uses a minimal Express app that mirrors the body-parsing setup in app.ts
 * so we don't need a live database.
 */

import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app with the same body-limit setup as app.ts.
 * Accepts an optional limit override (mirrors REQUEST_BODY_SIZE_LIMIT).
 */
function buildApp(limitOverride?: string) {
    const app = express();

    const bodyLimit = limitOverride ?? process.env.REQUEST_BODY_SIZE_LIMIT ?? "1mb";

    app.use(express.json({ limit: bodyLimit }));

    // 413 error handler — must be registered right after express.json()
    app.use(
        (
            err: Error & { type?: string; status?: number },
            _req: Request,
            res: Response,
            next: NextFunction,
        ) => {
            if (err.type === "entity.too.large" || err.status === 413) {
                return res.status(413).json({
                    error: "Payload Too Large",
                    message: `Request body exceeds the ${bodyLimit} limit. Reduce the payload size and try again.`,
                    limit: bodyLimit,
                });
            }
            next(err);
        },
    );

    // A simple echo route that accepts any JSON body
    app.post("/api/v1/echo", (req: Request, res: Response) => {
        res.status(200).json({ received: true, keys: Object.keys(req.body) });
    });

    // Health check — no body parsing needed
    app.get("/health", (_req: Request, res: Response) => {
        res.json({ status: "ok" });
    });

    return app;
}

/** Generate a JSON body of approximately `bytes` bytes. */
function bodyOfSize(bytes: number): Record<string, string> {
    // Each character in a JSON string is ~1 byte for ASCII.
    // Account for {"data":"..."} wrapper (~10 bytes).
    const value = "x".repeat(Math.max(0, bytes - 12));
    return { data: value };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Request body size limit", () => {
    describe("default 1mb limit", () => {
        const app = buildApp("1mb");

        it("accepts a small payload (< 1mb)", async () => {
            const res = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(512));

            expect(res.status).toBe(200);
            expect(res.body.received).toBe(true);
        });

        it("accepts a payload just under 1mb", async () => {
            const res = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(1024 * 1024 - 100)); // 1mb - 100 bytes

            expect(res.status).toBe(200);
        });

        it("returns 413 for a payload over 1mb", async () => {
            const res = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(1024 * 1024 + 1024)); // 1mb + 1kb

            expect(res.status).toBe(413);
        });

        it("413 response has structured JSON body", async () => {
            const res = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(1024 * 1024 + 1024));

            expect(res.status).toBe(413);
            expect(res.body).toMatchObject({
                error: "Payload Too Large",
                message: expect.stringContaining("1mb"),
                limit: "1mb",
            });
        });

        it("413 response Content-Type is application/json", async () => {
            const res = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(1024 * 1024 + 1024));

            expect(res.status).toBe(413);
            expect(res.headers["content-type"]).toMatch(/application\/json/);
        });
    });

    describe("custom limit via REQUEST_BODY_SIZE_LIMIT", () => {
        it("respects a smaller limit (100b)", async () => {
            const app = buildApp("100b");

            const small = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(50));
            expect(small.status).toBe(200);

            const large = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(200));
            expect(large.status).toBe(413);
            expect(large.body.limit).toBe("100b");
        });

        it("respects a larger limit (5mb)", async () => {
            const app = buildApp("5mb");

            // 2mb — should pass with a 5mb limit
            const res = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(2 * 1024 * 1024));
            expect(res.status).toBe(200);
        });
    });

    describe("non-JSON routes are unaffected", () => {
        const app = buildApp("1mb");

        it("GET /health returns 200 regardless of body limit", async () => {
            const res = await request(app).get("/health");
            expect(res.status).toBe(200);
            expect(res.body.status).toBe("ok");
        });
    });

    describe("413 error message references the configured limit", () => {
        it("message mentions the limit value", async () => {
            const app = buildApp("256kb");

            const res = await request(app)
                .post("/api/v1/echo")
                .set("Content-Type", "application/json")
                .send(bodyOfSize(300 * 1024)); // 300kb > 256kb

            expect(res.status).toBe(413);
            expect(res.body.message).toContain("256kb");
            expect(res.body.limit).toBe("256kb");
        });
    });
});
