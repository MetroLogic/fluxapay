/**
 * Batch payment link creation with a bounded-concurrency pool.
 *
 * @example
 * ```ts
 * const { successful, failed } = await createPaymentLinksBatch(
 *   (p) => client.paymentLinks.create(p),
 *   items,
 *   { concurrency: 10, continueOnError: true },
 * );
 * ```
 */

export interface CreatePaymentLinkParams {
  [key: string]: unknown;
}

export interface PaymentLink {
  id: string;
  [key: string]: unknown;
}

export interface BatchOptions {
  /** Max in-flight requests. Default 5, clamped to 1..20. */
  concurrency?: number;
  /** Keep processing after a failure. Default true. When false, remaining items are not started. */
  continueOnError?: boolean;
}

export interface BatchResult<T, P = CreatePaymentLinkParams> {
  successful: T[];
  failed: { item: P; error: Error }[];
}

export const DEFAULT_BATCH_CONCURRENCY = 5;
export const MAX_BATCH_CONCURRENCY = 20;

export async function createPaymentLinksBatch<
  P = CreatePaymentLinkParams,
  T = PaymentLink,
>(
  createFn: (item: P) => Promise<T>,
  items: P[],
  options: BatchOptions = {},
): Promise<BatchResult<T, P>> {
  const requested = Math.floor(options.concurrency ?? DEFAULT_BATCH_CONCURRENCY);
  const limit = Math.min(
    MAX_BATCH_CONCURRENCY,
    Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_BATCH_CONCURRENCY),
  );
  const continueOnError = options.continueOnError ?? true;

  const results: (T | undefined)[] = new Array(items.length);
  const ok: boolean[] = new Array(items.length).fill(false);
  const errors: (Error | undefined)[] = new Array(items.length);
  let next = 0;
  let aborted = false;

  async function worker(): Promise<void> {
    while (!aborted) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await createFn(items[i]);
        ok[i] = true;
      } catch (e) {
        errors[i] = e instanceof Error ? e : new Error(String(e));
        if (!continueOnError) aborted = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  const out: BatchResult<T, P> = { successful: [], failed: [] };
  items.forEach((item, i) => {
    if (ok[i]) out.successful.push(results[i] as T);
    else if (errors[i]) out.failed.push({ item, error: errors[i] as Error });
  });
  return out;
}
