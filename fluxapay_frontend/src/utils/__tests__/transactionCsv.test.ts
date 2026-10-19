import { describe, expect, it } from "vitest";
import {
  generateTransactionsCsv,
  TRANSACTION_EXPORT_COLUMNS,
} from "../transactionCsv";

const allColumns = TRANSACTION_EXPORT_COLUMNS.map((column) => column.key);

describe("generateTransactionsCsv", () => {
  it("selects and labels only requested columns", () => {
    const source =
      "created_at,payment_id,amount,fees,status,customer_email,metadata\r\n" +
      '2026-03-01,pay_1,12.50,0.25,paid,buyer@example.com,"{""order"":42}"\r\n';

    expect(generateTransactionsCsv(source, ["payment_id", "amount"])).toBe(
      "Reference,Amount\r\npay_1,12.50\r\n",
    );
  });

  it("escapes commas, quotes, newlines, and formula prefixes", () => {
    const source =
      'created_at,payment_id,amount,fees,status,customer_email,metadata\r\n' +
      '2026-03-01,"pay,\""1""",12.50,0.25,paid,"=cmd,\""run""\nnext",{}\r\n';

    expect(generateTransactionsCsv(source, ["payment_id", "customer_email"])).toBe(
      'Reference,Customer Email\r\n"pay,""1""","\'=cmd,""run""\nnext"\r\n',
    );
  });

  it("adds a UTF-8 BOM for Excel-compatible CSV", () => {
    const source = "created_at,payment_id,amount,fees,status,customer_email,metadata\r\n";
    expect(generateTransactionsCsv(source, allColumns, "excel").charCodeAt(0)).toBe(0xfeff);
  });

  it("requires at least one supported column", () => {
    const source = "created_at,payment_id,amount,fees,status,customer_email,metadata\r\n";
    expect(() => generateTransactionsCsv(source, [])).toThrow(
      "Select at least one column to export.",
    );
    expect(() =>
      generateTransactionsCsv(source, ["reference" as never]),
    ).toThrow("The transaction export contains an unsupported column.");
  });
});