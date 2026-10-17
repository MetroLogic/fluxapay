/** Request timeout and telemetry hooks for the FluxaPay client. */

export const DEFAULT_TIMEOUT_MS = 15000;

export interface TransportOptions {
  /** Per-request timeout in ms (default 15000). 0 disables. */
  timeoutMs?: number;
  /** Called right before each outbound request. */
  onRequest?: (req: { url: string; method: string; headers: Record<string, string> }) => void;
  /** Called after each response with elapsed time. */
  onResponse?: (res: Response, durationMs: number) => void;
}

export class FluxaPayTimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`FluxaPay request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'FluxaPayTimeoutError';
  }
}

// Per-client options, looked up by the shared request() helper.
const registry = new Map<string, TransportOptions>();
const key = (baseUrl: string, apiKey: string) => `${baseUrl}\u0000${apiKey}`;

export function registerTransport(baseUrl: string, apiKey: string, opts: TransportOptions): void {
  registry.set(key(baseUrl, apiKey), opts);
}

export function getTransport(baseUrl: string, apiKey: string): TransportOptions {
  return registry.get(key(baseUrl, apiKey)) ?? {};
}

export async function fetchWithTelemetry(
  url: string,
  init: RequestInit,
  opts: TransportOptions,
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const method = init.method ?? 'GET';
  opts.onRequest?.({ url, method, headers: { ...((init.headers as Record<string, string>) ?? {}) } });

  const controller = new AbortController();
  let timedOut = false;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    opts.onResponse?.(res, Date.now() - started);
    return res;
  } catch (err) {
    if (timedOut) throw new FluxaPayTimeoutError(url, timeoutMs);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
