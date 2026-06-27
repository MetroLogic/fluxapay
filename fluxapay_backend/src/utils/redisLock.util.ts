/**
 * redisLock.util.ts
 *
 * Distributed Redis lock utility for preventing concurrent cron job execution
 * across multiple instances.
 *
 * Uses Redis SETNX (SET if Not eXists) with TTL fallback on crash.
 * Pattern: lock_key = `cron:lock:${jobName}`
 */

import { redisClient } from "../middleware/redisIdempotency.middleware";

interface RedisLockOptions {
  ttlSeconds?: number; // Lock TTL in seconds (default: 5 minutes)
  lockOwner?: string;  // Identifier for this lock owner (default: hostname:pid)
}

const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const LOCK_PREFIX = "cron:lock:";

/**
 * Generate a lock owner identifier
 */
function getLockOwner(): string {
  const os = require("os");
  return `${os.hostname()}:${process.pid}:${Date.now()}`;
}

/**
 * Acquire a distributed Redis lock for a cron job.
 * Returns true if lock acquired, false if already held by another instance.
 */
export async function acquireCronLock(
  jobName: string,
  options: RedisLockOptions = {}
): Promise<boolean> {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const owner = options.lockOwner ?? getLockOwner();
  const lockKey = `${LOCK_PREFIX}${jobName}`;

  try {
    // SET only if key does not exist (NX), with TTL
    const result = await redisClient.set(lockKey, owner, "EX", ttl, "NX");
    return result === "OK";
  } catch (err: any) {
    console.warn(
      `[CronLock] Failed to acquire lock for "${jobName}": ${err.message}`
    );
    return false;
  }
}

/**
 * Release a distributed Redis lock for a cron job.
 */
export async function releaseCronLock(
  jobName: string,
  options: RedisLockOptions = {}
): Promise<void> {
  const owner = options.lockOwner ?? getLockOwner();
  const lockKey = `${LOCK_PREFIX}${jobName}`;

  try {
    // Only delete if owned by this instance (safety check)
    const existingOwner = await redisClient.get(lockKey);
    if (existingOwner === owner) {
      await redisClient.del(lockKey);
    }
  } catch (err: any) {
    console.warn(
      `[CronLock] Failed to release lock for "${jobName}": ${err.message}`
    );
  }
}
