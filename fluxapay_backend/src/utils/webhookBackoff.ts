/**
 * Full Jitter exponential backoff for webhook delivery retries.
 *   sleep = rand(0, min(maxDelay, base * 2 ^ attempt))
 *
 * Configurable via WEBHOOK_BASE_DELAY_MS, WEBHOOK_MAX_DELAY_MS, WEBHOOK_MAX_RETRIES.
 */

export interface WebhookBackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetries: number;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getWebhookBackoffConfig(): WebhookBackoffConfig {
  return {
    baseDelayMs: readPositiveInt("WEBHOOK_BASE_DELAY_MS", 60_000),
    maxDelayMs: readPositiveInt("WEBHOOK_MAX_DELAY_MS", 3_600_000),
    maxRetries: readPositiveInt("WEBHOOK_MAX_RETRIES", 3),
  };
}

/** Upper bound (exclusive of jitter) for a given attempt number. */
export function computeBackoffCeilingMs(
  attempt: number,
  config: Pick<WebhookBackoffConfig, "baseDelayMs" | "maxDelayMs"> = getWebhookBackoffConfig(),
): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 30));
  return Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** safeAttempt);
}

/** Full jitter delay in [0, ceiling]. `random` is injectable for tests. */
export function computeJitteredBackoffMs(
  attempt: number,
  config: Pick<WebhookBackoffConfig, "baseDelayMs" | "maxDelayMs"> = getWebhookBackoffConfig(),
  random: () => number = Math.random,
): number {
  return Math.floor(random() * computeBackoffCeilingMs(attempt, config));
}
