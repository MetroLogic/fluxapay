import { describe, expect, it } from "vitest";
import {
  buildExportFilename,
  PAYMENT_EXPORT_COLUMNS,
  toCsv,
} from "../dataExport.service";

describe("toCsv", () => {
  it("writes the payments header in column order", () => {
    const header = toCsv("payments", []);
    expect(header).toBe(
      PAYMENT_EXPORT_COLUMNS.map((column) => `"${column.label}"`).join(","),
    );
  });

  it("quotes values and escapes embedded quotes", () => {
    const csv = toCsv("payments", [
      {
        id: "pay_1",
        amount: 25,
        currency: "USDC",
        status: "paid",
        customer_email: 'a"b@example.com',
        description: "Invoice, phase 1",
      },
    ]);

    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"a""b@example.com"');
    expect(rows[1]).toContain('"Invoice, phase 1"');
  });

  it("emits an empty quoted field for missing values", () => {
    const csv = toCsv("payments", [{ id: "pay_1" }]);
    const dataRow = csv.split("\n")[1];

    expect(dataRow.startsWith('"pay_1",""')).toBe(true);
    expect(dataRow.match(/"[^"]*"/g)).toHaveLength(
      PAYMENT_EXPORT_COLUMNS.length,
    );
  });
});

describe("buildExportFilename", () => {
  it("names the file after the resource and day", () => {
    expect(
      buildExportFilename(
        "payments",
        "csv",
        new Date("2026-03-04T12:00:00.000Z"),
      ),
    ).toBe("payments_export_2026-03-04.csv");
  });
});
