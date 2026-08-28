import { describe, expect, it } from "vitest";
import { formatPercentage } from "@/lib/formatters";

/**
 * Guards the `/ 100` in formatPercentage (#956).
 *
 * `Intl.NumberFormat` with `style: 'percent'` multiplies its input by 100, so a
 * whole-number percentage has to be scaled down first. The division looks like a
 * double-scale bug at a glance and has been reported as one; these cases pin the
 * behaviour so removing it fails loudly instead of shipping "5,000.00%".
 */
describe("formatPercentage", () => {
  it("treats its input as a whole-number percentage", () => {
    expect(formatPercentage(50)).toBe("50.00%");
    expect(formatPercentage(100)).toBe("100.00%");
    expect(formatPercentage(2.5)).toBe("2.50%");
  });

  it("does not multiply the value by 100", () => {
    expect(formatPercentage(50)).not.toContain("5,000");
  });

  it("honours the decimals argument", () => {
    expect(formatPercentage(33.333, "en", 0)).toBe("33%");
    expect(formatPercentage(33.333, "en", 1)).toBe("33.3%");
  });

  it("handles zero and negative values", () => {
    expect(formatPercentage(0)).toBe("0.00%");
    expect(formatPercentage(-12.5)).toBe("-12.50%");
  });

  it("formats per locale", () => {
    expect(formatPercentage(50, "de", 2)).toMatch(/^50,00\s*%$/);
  });
});
