import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/client/client";
import crypto from "crypto";

const prisma = new PrismaClient();

const IDEMPOTENCY_TTL_HOURS = 24;

export interface IdempotentRequest extends Request {
  idempotencyKey?: string;
}

/**
 * Idempotency middleware for payment creation.
 *
 * Ensures that duplicate requests with the same Idempotency-Key header
 * return the cached response instead of creating duplicate payments.
 *
 * RFC: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header
 */
export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

  // If no idempotency key provided, proceed normally
  if (!idempotencyKey) {
    return next();
  }

  // Validate idempotency key format (must be non-empty string, max 255 chars)
  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length === 0 ||
    idempotencyKey.length > 255
  ) {
    res.status(400).json({
      error:
        "Invalid Idempotency-Key header. Must be a non-empty string with max 255 characters.",
    });
    return;
  }

  try {
    // Create a hash of the request body to detect conflicting requests
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex");

    // Check if we have a cached response for this idempotency key
    const existingRecord = await prisma.idempotencyRecord.findUnique({
      where: { idempotency_key: idempotencyKey },
    });

    if (existingRecord) {
      // Check if the request body matches
      if (existingRecord.request_hash !== requestHash) {
        res.status(422).json({
          error:
            "Idempotency key conflict: request body differs from original request",
        });
        return;
      }

      // Check if record is still valid (within TTL)
      const recordAge = Date.now() - existingRecord.created_at.getTime();
      const ttlMs = IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;

      if (recordAge > ttlMs) {
        // Record expired, delete it and proceed with new request
        await prisma.idempotencyRecord.delete({
          where: { idempotency_key: idempotencyKey },
        });
        (req as IdempotentRequest).idempotencyKey = idempotencyKey;
        return next();
      }

      // Return cached response
      res
        .status(existingRecord.response_code)
        .json(existingRecord.response_body);
      return;
    }

    // No existing record, attach idempotency key to request for later storage
    (req as IdempotentRequest).idempotencyKey = idempotencyKey;
    next();
  } catch (error) {
    console.error("Idempotency middleware error:", error);
    // On error, proceed without idempotency to avoid blocking legitimate requests
    next();
  }
};

/**
 * Store the response for future idempotent requests.
 * Call this after successfully processing the request.
 */
export async function storeIdempotentResponse(
  idempotencyKey: string,
  requestBody: unknown,
  responseCode: number,
  responseBody: unknown,
  userId?: string,
): Promise<void> {
  try {
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(requestBody))
      .digest("hex");

    await prisma.idempotencyRecord.upsert({
      where: { idempotency_key: idempotencyKey },
      create: {
        idempotency_key: idempotencyKey,
        user_id: userId,
        request_hash: requestHash,
        response_code: responseCode,
        response_body: responseBody as any,
      },
      update: {
        response_code: responseCode,
        response_body: responseBody as any,
        updated_at: new Date(),
      },
    });
  } catch (error) {
    // Log but don't throw - idempotency storage failure shouldn't break the request
    console.error("Failed to store idempotent response:", error);
  }
}

/**
 * Cleanup expired idempotency records.
 * Should be run periodically via cron.
 */
export async function cleanupExpiredIdempotencyRecords(): Promise<number> {
  const ttlMs = IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;
  const expiryDate = new Date(Date.now() - ttlMs);

  const result = await prisma.idempotencyRecord.deleteMany({
    where: {
      created_at: { lt: expiryDate },
    },
  });

  return result.count;
}
