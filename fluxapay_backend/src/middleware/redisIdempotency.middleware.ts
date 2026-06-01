import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import { AuthRequest } from "../types/express";
import { v4 as uuidv4, validate as validateUUID } from "uuid";

// Initialize Redis connection. Adjust the URL based on env vars if needed.
export const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export const redisIdempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const idempotencyKey = req.headers["idempotency-key"] as string;
  const merchantId = (req as AuthRequest).merchantId;

  if (!idempotencyKey) {
    res.status(400).json({ error: "Missing Idempotency-Key header." });
    return;
  }

  // Validate UUID v4 and max length 64
  if (!validateUUID(idempotencyKey) || idempotencyKey.length > 64) {
    res.status(400).json({ error: "Invalid Idempotency-Key format. Must be a UUID v4 and max 64 characters." });
    return;
  }

  if (!merchantId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const redisKey = `idempotency:${merchantId}:${idempotencyKey}`;

  try {
    // Try to set the key as in-flight
    // NX: Only set if it does not exist
    // EX: Set expiration to 24 hours (86400 seconds)
    const setnxResult = await redisClient.set(redisKey, "in-flight", "EX", 86400, "NX");

    if (setnxResult === "OK") {
      // Cache MISS - Request is now in-flight
      
      // Patch res.json to capture the response and save it
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        // Save to Redis (only if it's a success response or you decide to cache all?)
        // The requirement says: "persist the key -> charge mapping". Usually implies success 201/200.
        // Even if it's an error, storing it is safer to prevent multiple executions. Let's store whatever it is.
        redisClient.set(redisKey, JSON.stringify({
          status: res.statusCode,
          body
        }), "EX", 86400).catch(err => console.error("Failed to update idempotency cache", err));
        
        return originalJson(body);
      };

      return next();
    }

    // Cache HIT - Key already exists
    const existingValue = await redisClient.get(redisKey);

    if (existingValue === "in-flight") {
      res.status(409).json({ error: "idempotency_conflict", message: "A request with this idempotency key is already in progress." });
      return;
    }

    if (existingValue) {
      // It's a completed request
      try {
        const cachedResponse = JSON.parse(existingValue);
        res.setHeader("Idempotency-Replayed", "true");
        res.status(200).json(cachedResponse.body); // Return 200 on replay as requested
        return;
      } catch (err) {
        // Fallback if parsing fails for some reason
        console.error("Failed to parse cached response", err);
      }
    }
    
    // In rare case value is null but NX failed (maybe expired just now), let it proceed?
    next();
  } catch (error) {
    console.error("Redis Idempotency error:", error);
    // Fail closed or open? Let's fail with 500 to be safe.
    res.status(500).json({ error: "Internal Server Error during idempotency check.", details: error instanceof Error ? error.message : String(error) });
  }
};
