/**
 * Horizon failover client (issue #1257).
 *
 * Wraps one `Horizon.Server` per configured endpoint and routes every call
 * through the healthiest one:
 *
 * - Endpoints come from `STELLAR_HORIZON_URLS` (comma-separated, in priority
 *   order), falling back to the single `STELLAR_HORIZON_URL`.
 * - A call that fails with a *transport-level* problem — timeout, connection
 *   error, HTTP 5xx or 429 — is retried on the next endpoint. Anything else
 *   (e.g. 404 account not found, 400 tx_failed) is a real answer from Stellar
 *   and is rethrown unchanged, without failing over.
 * - Each endpoint has a circuit breaker: after `failureThreshold` consecutive
 *   transport failures it opens and is skipped. After `cooldownMs` it becomes
 *   half-open and gets one trial call; success closes it again.
 * - A periodic health check probes open endpoints so the primary is restored
 *   as soon as it recovers, even when no traffic would otherwise reach it.
 *
 * With a single endpoint the client is a transparent pass-through.
 */

import { Horizon } from "@stellar/stellar-sdk";
import { getLogger, getMetricsCollector } from "../utils/logger";

const logger = getLogger("HorizonFailover");
const metrics = getMetricsCollector();

export const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";

export type CircuitState = "closed" | "open" | "half_open";

export interface HorizonEndpointStatus {
  url: string;
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastError: string | null;
  openedAt: string | null;
  lastHealthCheckAt: string | null;
}

export interface HorizonFailoverOptions {
  /** Consecutive transport failures before an endpoint's circuit opens. */
  failureThreshold?: number;
  /** How long an open circuit is skipped before a half-open trial. */
  cooldownMs?: number;
  /** Interval for background health checks of open endpoints. */
  healthCheckIntervalMs?: number;
  /** Timeout for a single health-check probe. */
  healthCheckTimeoutMs?: number;
  /** Pre-built servers to reuse, by index (e.g. a service's existing primary). */
  servers?: Array<Horizon.Server | undefined>;
  /** Server factory (tests). */
  createServer?: (url: string) => Horizon.Server;
  /** Health-check probe (tests). Resolves true when the endpoint is healthy. */
  probe?: (url: string, timeoutMs: number) => Promise<boolean>;
  /** Clock (tests). */
  now?: () => number;
}

interface Endpoint {
  url: string;
  server: Horizon.Server;
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastError: string | null;
  openedAt: number | null;
  lastHealthCheckAt: number | null;
}

/** Thrown when every endpoint failed; `lastError` is the last underlying error. */
export class HorizonUnavailableError extends Error {
  constructor(
    message: string,
    public readonly attempts: Array<{ url: string; error: string }>,
    public readonly lastError?: unknown,
  ) {
    super(message);
    this.name = "HorizonUnavailableError";
  }
}

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Parse the endpoint list: `STELLAR_HORIZON_URLS` (comma-separated) wins,
 * then `STELLAR_HORIZON_URL`, then the public testnet. Blank entries,
 * duplicates and trailing slashes are removed; invalid URLs are dropped
 * with a warning.
 */
export function parseHorizonUrls(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.STELLAR_HORIZON_URLS?.trim()
    ? env.STELLAR_HORIZON_URLS
    : env.STELLAR_HORIZON_URL || DEFAULT_HORIZON_URL;

  const urls: string[] = [];
  for (const part of raw.split(",")) {
    const candidate = part.trim().replace(/\/+$/, "");
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad scheme");
    } catch {
      logger.warn("Ignoring invalid Horizon URL in configuration", { url: candidate });
      continue;
    }
    if (!urls.includes(candidate)) urls.push(candidate);
  }
  return urls.length > 0 ? urls : [DEFAULT_HORIZON_URL];
}

/** HTTP status from a Horizon/axios-style error, if any. */
function errorStatus(error: unknown): number | undefined {
  const e = error as { response?: { status?: unknown }; status?: unknown } | null;
  const status = e?.response?.status ?? e?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * True when an error means "this endpoint is unhealthy" rather than a real
 * answer from the network: timeouts, connection failures, 5xx and 429.
 */
export function isFailoverError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status !== undefined) return status >= 500 || status === 429;

  const e = error as { code?: unknown; message?: unknown; name?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ECONNABORTED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EPIPE",
      "ERR_NETWORK",
    ].includes(code)
  ) {
    return true;
  }
  const name = typeof e?.name === "string" ? e.name : "";
  if (name === "AbortError" || name === "TimeoutError" || name === "NetworkError") return true;
  const message = typeof e?.message === "string" ? e.message.toLowerCase() : "";
  return /timeout|timed out|socket hang up|network error|econnrefused|econnreset/.test(message);
}

async function defaultProbe(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export class HorizonFailoverClient {
  private readonly endpoints: Endpoint[];
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly healthCheckIntervalMs: number;
  private readonly healthCheckTimeoutMs: number;
  private readonly probe: (url: string, timeoutMs: number) => Promise<boolean>;
  private readonly now: () => number;
  private healthTimer: NodeJS.Timeout | null = null;

  constructor(urls: string[] = parseHorizonUrls(), options: HorizonFailoverOptions = {}) {
    const list = urls.length > 0 ? urls : [DEFAULT_HORIZON_URL];
    const create = options.createServer ?? ((url: string) => new Horizon.Server(url));
    this.failureThreshold = options.failureThreshold ?? envInt("HORIZON_FAILOVER_THRESHOLD", 3);
    this.cooldownMs = options.cooldownMs ?? envInt("HORIZON_FAILOVER_COOLDOWN_MS", 30_000);
    this.healthCheckIntervalMs =
      options.healthCheckIntervalMs ?? envInt("HORIZON_HEALTH_CHECK_INTERVAL_MS", 30_000);
    this.healthCheckTimeoutMs =
      options.healthCheckTimeoutMs ?? envInt("HORIZON_HEALTH_CHECK_TIMEOUT_MS", 5_000);
    this.probe = options.probe ?? defaultProbe;
    this.now = options.now ?? Date.now;

    this.endpoints = list.map((url, i) => ({
      url,
      server: options.servers?.[i] ?? create(url),
      state: "closed",
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastError: null,
      openedAt: null,
      lastHealthCheckAt: null,
    }));

    if (this.endpoints.length > 1) {
      logger.info("Horizon failover enabled", { endpoints: this.endpoints.map((e) => e.url) });
    }
  }

  /** The primary endpoint's server (for code that has not migrated to `call`). */
  get primary(): Horizon.Server {
    return this.endpoints[0].server;
  }

  get urls(): string[] {
    return this.endpoints.map((e) => e.url);
  }

  /**
   * Run `fn` against the best available endpoint, failing over on transport
   * errors. The original error is rethrown unchanged when it is not a
   * transport error, or when there is only one endpoint.
   */
  async call<T>(fn: (server: Horizon.Server) => Promise<T>, operation = "horizon.call"): Promise<T> {
    const candidates = this.orderedCandidates();
    const attempts: Array<{ url: string; error: string }> = [];
    let lastError: unknown;

    for (let i = 0; i < candidates.length; i++) {
      const endpoint = candidates[i];
      try {
        const result = await fn(endpoint.server);
        this.recordSuccess(endpoint, operation, i > 0);
        return result;
      } catch (error) {
        if (!isFailoverError(error)) {
          // A genuine response (404, 400 tx_failed, …): the endpoint is healthy.
          this.recordSuccess(endpoint, operation, false);
          throw error;
        }
        lastError = error;
        attempts.push({ url: endpoint.url, error: describe(error) });
        this.recordFailure(endpoint, operation, error);
        if (i < candidates.length - 1) {
          metrics.increment("horizon.failover", {
            operation,
            from: endpoint.url,
            to: candidates[i + 1].url,
          });
          logger.warn("Horizon endpoint failed; failing over", {
            operation,
            from: endpoint.url,
            to: candidates[i + 1].url,
            error: describe(error),
          });
        }
      }
    }

    if (this.endpoints.length === 1) throw lastError;

    logger.error("All Horizon endpoints failed", { operation, attempts });
    throw new HorizonUnavailableError(
      `All ${candidates.length} Horizon endpoint(s) failed for ${operation}`,
      attempts,
      lastError,
    );
  }

  /** Endpoints to try, in priority order: usable ones first, open circuits last. */
  private orderedCandidates(): Endpoint[] {
    const now = this.now();
    const usable: Endpoint[] = [];
    const tripped: Endpoint[] = [];
    for (const endpoint of this.endpoints) {
      if (endpoint.state === "open" && endpoint.openedAt !== null && now - endpoint.openedAt >= this.cooldownMs) {
        endpoint.state = "half_open";
        logger.info("Horizon endpoint half-open; allowing a trial request", { url: endpoint.url });
      }
      (endpoint.state === "open" ? tripped : usable).push(endpoint);
    }
    // Every circuit open: still try them all rather than fail without trying.
    return usable.length > 0 ? usable : tripped;
  }

  private recordSuccess(endpoint: Endpoint, operation: string, afterFailover: boolean): void {
    const wasDegraded = endpoint.state !== "closed";
    endpoint.totalSuccesses += 1;
    endpoint.consecutiveFailures = 0;
    endpoint.state = "closed";
    endpoint.openedAt = null;
    if (wasDegraded) {
      logger.info("Horizon endpoint recovered", { url: endpoint.url, operation });
      metrics.increment("horizon.endpoint.recovered", { url: endpoint.url });
    } else if (afterFailover) {
      logger.info("Horizon request served by fallback endpoint", { url: endpoint.url, operation });
    }
  }

  private recordFailure(endpoint: Endpoint, operation: string, error: unknown): void {
    endpoint.totalFailures += 1;
    endpoint.consecutiveFailures += 1;
    endpoint.lastError = describe(error);
    metrics.increment("horizon.endpoint.failure", { url: endpoint.url, operation });

    const shouldOpen =
      endpoint.state === "half_open" || endpoint.consecutiveFailures >= this.failureThreshold;
    if (shouldOpen && endpoint.state !== "open") {
      endpoint.state = "open";
      endpoint.openedAt = this.now();
      logger.error("Horizon endpoint circuit opened", {
        url: endpoint.url,
        consecutiveFailures: endpoint.consecutiveFailures,
        cooldownMs: this.cooldownMs,
      });
      metrics.increment("horizon.endpoint.circuit_open", { url: endpoint.url });
    }
  }

  /**
   * Probe every non-closed endpoint once and close the circuit of those that
   * answer, restoring the primary as soon as it is back.
   */
  async runHealthChecks(): Promise<HorizonEndpointStatus[]> {
    await Promise.all(
      this.endpoints
        .filter((e) => e.state !== "closed")
        .map(async (endpoint) => {
          endpoint.lastHealthCheckAt = this.now();
          const healthy = await this.probe(endpoint.url, this.healthCheckTimeoutMs).catch(() => false);
          if (healthy) {
            this.recordSuccess(endpoint, "health_check", false);
          } else {
            logger.debug("Horizon endpoint still unhealthy", { url: endpoint.url });
            if (endpoint.state === "half_open") {
              endpoint.state = "open";
              endpoint.openedAt = this.now();
            }
          }
        }),
    );
    return this.getStatus();
  }

  /** Start periodic health checks (no-op for a single endpoint). */
  startHealthChecks(): void {
    if (this.healthTimer || this.endpoints.length < 2) return;
    this.healthTimer = setInterval(() => {
      void this.runHealthChecks();
    }, this.healthCheckIntervalMs);
    this.healthTimer.unref?.();
  }

  stopHealthChecks(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  getStatus(): HorizonEndpointStatus[] {
    return this.endpoints.map((e) => ({
      url: e.url,
      state: e.state,
      consecutiveFailures: e.consecutiveFailures,
      totalFailures: e.totalFailures,
      totalSuccesses: e.totalSuccesses,
      lastError: e.lastError,
      openedAt: e.openedAt === null ? null : new Date(e.openedAt).toISOString(),
      lastHealthCheckAt: e.lastHealthCheckAt === null ? null : new Date(e.lastHealthCheckAt).toISOString(),
    }));
  }
}

function describe(error: unknown): string {
  const status = errorStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  return status !== undefined ? `HTTP ${status}: ${message}` : message;
}
