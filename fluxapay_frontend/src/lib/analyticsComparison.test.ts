import { getPreviousPeriod, percentChange, rangeLengthDays, alignSeries, averageTicket } from "./analyticsComparison";

describe("analytics comparison", () => {
  it("computes the previous equivalent period without overlap", () => {
    expect(getPreviousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-01-29", to: "2026-02-28" });
    expect(getPreviousPeriod({ from: "2026-03-08", to: "2026-03-14" })).toEqual({ from: "2026-03-01", to: "2026-03-07" });
  });

  it("keeps equal length across month and year boundaries", () => {
    const r = { from: "2026-01-01", to: "2026-01-10" };
    const p = getPreviousPeriod(r);
    expect(p).toEqual({ from: "2025-12-22", to: "2025-12-31" });
    expect(rangeLengthDays(p)).toBe(rangeLengthDays(r));
  });

  it("computes percent change", () => {
    expect(percentChange(114.2, 100)).toBeCloseTo(14.2);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });

  it("aligns series by offset", () => {
    const a = alignSeries([{ date: "b1", revenue: 1 }, { date: "b2", revenue: 2 }], [{ date: "a1", revenue: 5 }]);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ current: 1, previous: 5 });
    expect(a[1].previous).toBeUndefined();
  });

  it("average ticket handles zero payments", () => {
    expect(averageTicket(100, 0)).toBe(0);
    expect(averageTicket(100, 4)).toBe(25);
  });
});
