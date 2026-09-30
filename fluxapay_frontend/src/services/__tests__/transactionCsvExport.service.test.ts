import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exportCsv } = vi.hoisted(() => ({ exportCsv: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { payments: { export: exportCsv } },
}));

import {
  DATE_RANGE_PRESETS,
  describeDateRange,
  downloadTransactionsCsv,
  resolveDateRangePreset,
  toDateInputValue,
  validateDateRange,
} from "../transactionCsvExport.service";

const NOW = new Date(2026, 2, 15, 12, 0, 0); // 15 March 2026, local time

describe("toDateInputValue", () => {
  it("formats a date as YYYY-MM-DD with zero padding", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("resolveDateRangePreset", () => {
  it("treats all time as an unbounded range", () => {
    expect(resolveDateRangePreset("all", NOW)).toEqual({ from: "", to: "" });
  });

  it("includes today in a trailing-N-days range", () => {
    expect(resolveDateRangePreset("7d", NOW)).toEqual({
      from: "2026-03-09",
      to: "2026-03-15",
    });
  });

  it("supports 30 and 90 day windows", () => {
    expect(resolveDateRangePreset("30d", NOW).from).toBe("2026-02-14");
    expect(resolveDateRangePreset("90d", NOW).from).toBe("2025-12-16");
  });

  it("starts This month on the first of the month", () => {
    expect(resolveDateRangePreset("month", NOW)).toEqual({
      from: "2026-03-01",
      to: "2026-03-15",
    });
  });

  it("leaves a custom range untouched", () => {
    expect(resolveDateRangePreset("custom", NOW)).toEqual({ from: "", to: "" });
  });
});

describe("describeDateRange", () => {
  it("describes empty, single-sided and two-sided ranges", () => {
    expect(describeDateRange("", "")).toBe("All time");
    expect(describeDateRange("2026-03-01", "2026-03-31")).toBe(
      "2026-03-01 to 2026-03-31",
    );
    expect(describeDateRange("2026-03-01", "2026-03-01")).toBe("2026-03-01");
    expect(describeDateRange("2026-03-01", "")).toBe("From 2026-03-01");
    expect(describeDateRange("", "2026-03-31")).toBe("Up to 2026-03-31");
  });
});

describe("validateDateRange", () => {
  it("accepts an empty or well-formed range", () => {
    expect(validateDateRange("", "")).toBeNull();
    expect(validateDateRange("2026-03-01", "2026-03-31")).toBeNull();
    expect(validateDateRange("2026-03-01", "2026-03-01")).toBeNull();
  });

  it("rejects malformed and inverted ranges", () => {
    expect(validateDateRange("03/01/2026", "")).toBe(
      "Start date is not a valid date.",
    );
    expect(validateDateRange("", "nope")).toBe("End date is not a valid date.");
    expect(validateDateRange("2026-03-31", "2026-03-01")).toBe(
      "Start date must be on or before the end date.",
    );
  });
});

describe("DATE_RANGE_PRESETS", () => {
  it("exposes a Custom option so the select always has a matching value", () => {
    expect(DATE_RANGE_PRESETS.map((p) => p.value)).toContain("custom");
  });
});

describe("downloadTransactionsCsv", () => {
  const blob = new Blob(["a,b\r\n"], { type: "text/csv" });
  let clicked: HTMLAnchorElement | undefined;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let restoreClick: () => void;

  beforeEach(() => {
    clicked = undefined;
    createObjectURL = vi.fn(() => "blob:mock");
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
      clicked = this;
    };
    restoreClick = () => {
      HTMLAnchorElement.prototype.click = originalClick;
    };

    exportCsv.mockReset();
  });

  afterEach(() => {
    restoreClick?.();
    restoreClick = undefined as unknown as () => void;
  });

  it("forwards the date range and every filter to the export endpoint", async () => {
    exportCsv.mockResolvedValue({
      data: { blob, filename: "transactions_2026-03-15.csv", rowCount: 12, truncated: false },
    });

    await downloadTransactionsCsv({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      status: "completed",
      currency: "USDC",
      search: "buyer",
      amountMin: "10",
      amountMax: "500",
    });

    expect(exportCsv).toHaveBeenCalledWith(
      {
        status: "completed",
        currency: "USDC",
        search: "buyer",
        date_from: "2026-03-01",
        date_to: "2026-03-31",
        amount_min: "10",
        amount_max: "500",
      },
      undefined,
    );
  });

  it("omits unset filters so the export covers the whole range", async () => {
    exportCsv.mockResolvedValue({
      data: { blob, filename: "transactions.csv", rowCount: 0, truncated: false },
    });

    await downloadTransactionsCsv({});

    expect(exportCsv.mock.calls[0][0]).toEqual({
      status: undefined,
      currency: undefined,
      search: undefined,
      date_from: undefined,
      date_to: undefined,
      amount_min: undefined,
      amount_max: undefined,
    });
  });

  it("hands the server blob to the browser under the server filename", async () => {
    exportCsv.mockResolvedValue({
      data: { blob, filename: "transactions_2026-03-15.csv", rowCount: 3, truncated: false },
    });

    const result = await downloadTransactionsCsv({ dateFrom: "2026-03-01" });

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked?.download).toBe("transactions_2026-03-15.csv");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(result.rowCount).toBe(3);
  });

  it("reports the truncated flag so the UI can warn about the row cap", async () => {
    exportCsv.mockResolvedValue({
      data: { blob, filename: "transactions.csv", rowCount: 50000, truncated: true },
    });

    const result = await downloadTransactionsCsv({});
    expect(result.truncated).toBe(true);
  });

  it("throws the API error message so the caller can toast it", async () => {
    exportCsv.mockResolvedValue({
      error: new Error("date_from must be earlier than or equal to date_to"),
    });

    await expect(downloadTransactionsCsv({})).rejects.toThrow(
      "date_from must be earlier than or equal to date_to",
    );
    expect(clicked).toBeUndefined();
  });
});
