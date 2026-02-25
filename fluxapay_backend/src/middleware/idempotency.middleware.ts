import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { PrismaClient } from "../generated/client/client";
import { AuthRequest } from "../types/express";

const prisma = new PrismaClient();

/**
 * Idempotency Middleware for Express
 * 
 * Flow:
 * 1. Check for 'Idempotency-Key' header on POST requests.
 * 2. If present, query the database for a record matching the key.
 * 3. Verify the request body hash matches the stored hash.
 * 4. If a match is found and user_id matches (if applicable), send the stored response.
 * 5. If not found, execute the request and intercept the response to save it.
 */
export const idempotencyMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const key = req.headers["idempotency-key"] as string;
    const authReq = req as AuthRequest;
    const userId = authReq.merchantId || authReq.user?.id;

    // Only handle POST requests with an idempotency key header
    if (req.method !== "POST" || !key) {
        return next();
    }

    // Generate a hash of the request body to detect body changes for the same key
    const requestHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(req.body))
        .digest("hex");

    try {
        // Check if we have seen this key before
        const record = await prisma.idempotencyRecord.findUnique({
            where: {
                idempotency_key: key,
            },
        });

        if (record) {
            // Security check: if the record has a user_id, it must match the current user
            if (record.user_id && record.user_id !== userId) {
                console.warn(`[Idempotency] Potential key theft: ${key}`);
                return res.status(403).json({ error: "Idempotency key belongs to another user" });
            }

            // Conflict check: if the key is the same but the body changed, it's a conflict
            if (record.request_hash !== requestHash) {
                return res.status(422).json({
                    error: "Conflict: Idempotency-Key used with different request parameters",
                });
            }

            // Return the cached response
            console.log(`[Idempotency] HIT for key: ${key}`);
            res.setHeader("X-Idempotency-Cache", "HIT");
            return res.status(record.response_code).json(record.response_body);
        }

        // Capture original response functions to cache the result after execution
        const originalJson = res.json;

        // Override res.json to capture the response body
        res.json = function (body: any): Response {
            res.json = originalJson; // Restore original to prevent infinite loop

            // Only cache successful or non-server-error responses if appropriate
            // Here we cache everything to fulfill the requirement of "stored response"
            saveIdempotencyRecord(key, userId, requestHash, res.statusCode, body)
                .catch(err => console.error("[Idempotency] Failed to save record:", err));

            return originalJson.call(this, body);
        };

        next();
    } catch (err) {
        console.error("[Idempotency] Middleware error:", err);
        next();
    }
};

/**
 * Saves the response result to the database for future lookups.
 */
async function saveIdempotencyRecord(
    key: string,
    userId: string | undefined,
    requestHash: string,
    statusCode: number,
    body: any
) {
    await prisma.idempotencyRecord.upsert({
        where: { idempotency_key: key },
        update: {
            user_id: userId || null,
            request_hash: requestHash,
            response_code: statusCode,
            response_body: body,
        },
        create: {
            idempotency_key: key,
            user_id: userId || null,
            request_hash: requestHash,
            response_code: statusCode,
            response_body: body,
        },
    });


}
