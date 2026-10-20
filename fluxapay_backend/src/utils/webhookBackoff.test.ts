import { computeBackoffCeilingMs, computeJitteredBackoffMs } from "./webhookBackoff";

describe("webhook backoff", () => {
  const cfg = { baseDelayMs: 1000, maxDelayMs: 30_000 };

  it("grows exponentially up to the cap", () => {
    expect(computeBackoffCeilingMs(0, cfg)).toBe(1000);
    expect(computeBackoffCeilingMs(2, cfg)).toBe(4000);
    expect(computeBackoffCeilingMs(10, cfg)).toBe(30_000);
  });

  it("keeps jitter within [0, ceiling]", () => {
    for (let a = 0; a < 8; a++) {
      const ceil = computeBackoffCeilingMs(a, cfg);
      expect(computeJitteredBackoffMs(a, cfg, () => 0)).toBe(0);
      expect(computeJitteredBackoffMs(a, cfg, () => 0.999999)).toBeLessThanOrEqual(ceil);
      const v = computeJitteredBackoffMs(a, cfg);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(ceil);
    }
  });

  it("spreads retries (no identical delays across many samples)", () => {
    const set = new Set(Array.from({ length: 50 }, () => computeJitteredBackoffMs(5, cfg)));
    expect(set.size).toBeGreaterThan(10);
  });
});
