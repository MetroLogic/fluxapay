import Papa from "papaparse";

export const TRANSACTION_EXPORT_COLUMNS = [
  { key: "created_at", label: "Date" },
  { key: "payment_id", label: "Reference" },
  { key: "amount", label: "Amount" },
  { key: "fees", label: "Fees" },
  { key: "status", label: "Status" },
  { key: "customer_email", label: "Customer Email" },
  { key: "metadata", label: "Metadata" },
] as const;

export type TransactionExportColumn = (typeof TRANSACTION_EXPORT_COLUMNS)[number]["key"];
export type TransactionCsvFormat = "csv" | "excel";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NUMERIC_CELL = /^-?\d+(?:\.\d+)?$/;
const NEEDS_QUOTING = /[",\r\n]/;

function escapeCsvCell(value: string): string {
  const safeValue =
    !NUMERIC_CELL.test(value) && FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return NEEDS_QUOTING.test(safeValue)
    ? `"${safeValue.replace(/"/g, '""')}"`
    : safeValue;
}

/** Parse the streamed source CSV and emit the requested columns as RFC-4180 CSV. */
export function generateTransactionsCsv(
  source: string,
  selectedColumns: readonly TransactionExportColumn[],
  format: TransactionCsvFormat = "csv",
): string {
  if (selectedColumns.length === 0) {
    throw new Error("Select at least one column to export.");
  }

  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length > 0 || !parsed.meta.fields) {
    throw new Error("The transaction export could not be parsed.");
  }

  const columns = TRANSACTION_EXPORT_COLUMNS.filter(
    (column) => selectedColumns.includes(column.key),
  );
  if (columns.length !== selectedColumns.length) {
    throw new Error("The transaction export contains an unsupported column.");
  }

  const rows = [
    columns.map((column) => escapeCsvCell(column.label)).join(","),
    ...parsed.data.map((row) =>
      columns.map((column) => escapeCsvCell(row[column.key] ?? "")).join(","),
    ),
  ];
  const csv = `${rows.join("\r\n")}\r\n`;
  return format === "excel" ? `\uFEFF${csv}` : csv;
}