/**
 * redisClose.util.ts
 *
 * Gracefully closes an ioredis client during shutdown.
 *
 * Sends QUIT so pending replies are flushed and the server releases the
 * connection cleanly; falls back to a hard disconnect when the client never
 * connected, QUIT fails (e.g. Redis unreachable), or QUIT does not complete
 * within `timeoutMs`.
 */

import type Redis from "ioredis";

const DEFAULT_QUIT_TIMEOUT_MS = 2000;

export async function closeRedisClient(
  client: Redis | null | undefined,
  timeoutMs: number = DEFAULT_QUIT_TIMEOUT_MS,
): Promise<void> {
  if (!client || client.status === "end") return;

  // lazyConnect client that was never used — nothing to flush.
  if (client.status === "wait") {
    client.disconnect();
    return;
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.quit(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Redis QUIT timed out")), timeoutMs);
        timer.unref();
      }),
    ]);
  } catch {
    client.disconnect();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
