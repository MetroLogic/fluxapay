import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import { AuthRequest } from "../types/express";
import { validate as validateUUID } from "uuid";
import crypto from "crypto";
import { closeRedisClient } from "../utils/redisClose.util";

// Initialize Redis connection. Adjust the URL based on env vars if needed.
// Fail fast when Redis is down (no offline queue) so tests/CI do not hang indefinitely.
export const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2000,
});

/** Closes the shared idempotency/lock Redis connection (used on shutdown). */
export async function closeIdempotencyRedisClient(): Promise<void> {
  await closeRedisClient(redisClient);
}

/** TTL for idempotency keys in seconds (24 hours). */
const IDEMPOTENCY_TTL_SECONDS = 86400;

/** Sentinel stored while the original request is still being processed. */
const IN_FLIGHT_SENTINEL = "in-flight";

/** Shape of a completed cached response stored in Redis. */
interface CachedResponse {
  status: number;
  body: unknown;
  requestHash: string;
}

/** Hash a request body deterministically for conflict detection. */
function hashBody(body: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export const redisIdempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
  const merchantId = (req as AuthRequest).merchantId;

  if (!idempotencyKey) {
    sendApiError(
      res,
      apiError(400, ErrorCode.MISSING_IDEMPOTENCY_KEY, "Missing Idempotency-Key header."),
    );
    return;
  }

  // Validate: UUID v4 format, max 64 chars
  if (!validateUUID(idempotencyKey) || idempotencyKey.length > 64) {
    sendApiError(
      res,
      apiError(
        400,
        ErrorCode.INVALID_IDEMPOTENCY_KEY,
        "Invalid Idempotency-Key format. Must be a UUID v4 and max 64 characters.",
      ),
    );
    return;
  }

  if (!merchantId) {
    sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized"));
    return;
  }

  const redisKey = `idempotency:${merchantId}:${idempotencyKey}`;
  const requestHash = hashBody(req.body);

  try {
    // Attempt to claim the key as in-flight (NX = only set if not exists, EX = 24h TTL).
    const setnxResult = await redisClient.set(
      redisKey,
      IN_FLIGHT_SENTINEL,
      "EX",
      IDEMPOTENCY_TTL_SECONDS,
      "NX",
    );

    if (setnxResult === "OK") {
      // Cache MISS — this is the first request for this key.
      // Patch res.json to capture the response body and persist it to Redis.
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        const cached: CachedResponse = {
          status: res.statusCode,
          body,
          requestHash,
        };
        redisClient
          .set(redisKey, JSON.stringify(cached), "EX", IDEMPOTENCY_TTL_SECONDS)
          .catch((err) => console.error("Failed to update idempotency cache:", err));
        return originalJson(body);
      };

      return next();
    }

    // Cache HIT — key already exists; fetch the stored value.
    const existingValue = await redisClient.get(redisKey);

    if (existingValue === IN_FLIGHT_SENTINEL) {
      // Another request is currently in-flight with this key.
      sendApiError(
        res,
        apiError(
          409,
          ErrorCode.IDEMPOTENCY_CONFLICT,
          "A request with this idempotency key is already in progress.",
        ),
      );
      return;
    }

    if (existingValue) {
      // Completed request — parse and replay.
      let cached: CachedResponse;
      try {
        cached = JSON.parse(existingValue) as CachedResponse;
      } catch {
        // Corrupt cached value; fail safely so a retry can proceed.
        console.error("Failed to parse cached idempotency response for key:", redisKey);
        return next();
      }

      // Guard against body mismatch: same key, different payload → 422.
      if (cached.requestHash !== requestHash) {
        sendApiError(
          res,
          apiError(
            422,
            ErrorCode.IDEMPOTENCY_CONFLICT,
            "Idempotency key conflict: request body differs from the original request.",
          ),
        );
        return;
      }

      // Replay the original response with the original status code.
      res.setHeader("Idempotency-Replayed", "true");
      res.status(cached.status).json(cached.body);
      return;
    }

    // Rare edge case: NX failed but value is now null (key expired between SET
    // and GET). Allow the request to proceed as a fresh attempt.
    next();
  } catch (error) {
    console.error("Redis Idempotency error:", error);
    sendApiError(
      res,
      apiError(500, ErrorCode.IDEMPOTENCY_CHECK_FAILED, "Internal Server Error during idempotency check.", {
        details: { reason: error instanceof Error ? error.message : String(error) },
      }),
    );
  }
};
