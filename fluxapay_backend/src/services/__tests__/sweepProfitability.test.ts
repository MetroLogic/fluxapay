import {
  evaluateSweepProfitability,
  BELOW_PROFITABILITY_THRESHOLD,
} from "../sweepProfitability";

describe("evaluateSweepProfitability", () => {
  const base = { estimatedFee: 0.01, minProfitability: 0.5 };

  it("sweeps when net is above threshold", () => {
    expect(evaluateSweepProfitability({ ...base, depositBalance: 5 }).sweep).toBe(true);
  });

  it("defers when net is below threshold", () => {
    const d = evaluateSweepProfitability({ ...base, depositBalance: 0.2 });
    expect(d.sweep).toBe(false);
    expect(d.reason).toBe(BELOW_PROFITABILITY_THRESHOLD);
  });

  it("sweeps dust once the defer window expires if still net positive", () => {
    const d = evaluateSweepProfitability({
      ...base,
      depositBalance: 0.2,
      ageMs: 100,
      windowMs: 50,
    });
    expect(d.sweep).toBe(true);
  });

  it("never sweeps when fee exceeds balance", () => {
    const d = evaluateSweepProfitability({
      ...base,
      depositBalance: 0.005,
      ageMs: 100,
      windowMs: 50,
    });
    expect(d.sweep).toBe(false);
  });
});
