/**
 * redisLock.util.ts
 *
 * Distributed Redis lock utility for preventing concurrent cron job execution
 * across multiple instances.
 *
 * Uses Redis SETNX (SET if Not eXists) with TTL fallback on crash.
 * Pattern: lock_key = `cron:lock:${jobName}`
 */

import os from "os";
import { redisClient } from "../middleware/redisIdempotency.middleware";

interface RedisLockOptions {
  ttlSeconds?: number; // Lock TTL in seconds (default: 5 minutes)
  lockOwner?: string;  // Identifier for this lock owner (default: hostname:pid)
}

const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const LOCK_PREFIX = "cron:lock:";

/**
 * Generate a lock owner identifier.
 *
 * Exported so a caller can generate ONE owner id per tick/execution and pass
 * it explicitly to both `acquireCronLock` and `releaseCronLock`. Relying on
 * each function's own default (calling this internally) is unsafe: since it
 * includes `Date.now()`, two independent calls — one at acquire time, one at
 * release time — produce different strings, so `releaseCronLock`'s
 * ownership check would never match and the lock would never actually be
 * released (it would sit until its TTL expires instead).
 */
export function getLockOwner(): string {
  return `${os.hostname()}:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
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
