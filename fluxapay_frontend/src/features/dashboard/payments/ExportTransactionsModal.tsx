"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Calendar, Download } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import {
  DATE_RANGE_PRESETS,
  describeDateRange,
  downloadTransactionsCsv,
  resolveDateRangePreset,
  validateDateRange,
  type DateRangePreset,
  type TransactionExportFilters,
} from "@/services/transactionCsvExport.service";

interface ExportTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Filters currently applied to the table, used as the dialog's defaults. */
  initialFilters?: TransactionExportFilters;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "overpaid", label: "Overpaid" },
  { value: "paid", label: "Paid" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

const CURRENCY_OPTIONS = [
  { value: "all", label: "All currencies" },
  { value: "USDC", label: "USDC" },
  { value: "XLM", label: "XLM" },
  { value: "EURC", label: "EURC" },
];

/**
 * Date-range aware CSV export dialog for the transaction history (#1216).
 * Rows are streamed by the server, so even a multi-year range downloads
 * without a background job.
 */
export function ExportTransactionsModal({
  isOpen,
  onClose,
  initialFilters,
}: ExportTransactionsModalProps) {
  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [search, setSearch] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Re-seed the form from the page filters each time the dialog opens. The
  // deps are the individual values so an inline object from the parent cannot
  // reset the form on every re-render.
  const {
    dateFrom: initialDateFrom,
    dateTo: initialDateTo,
    status: initialStatus,
    currency: initialCurrency,
    search: initialSearch,
    amountMin: initialAmountMin,
    amountMax: initialAmountMax,
  } = initialFilters ?? {};

  useEffect(() => {
    if (!isOpen) return;
    const from = initialDateFrom ?? "";
    const to = initialDateTo ?? "";
    setDateFrom(from);
    setDateTo(to);
    setStatus(initialStatus ?? "all");
    setCurrency(initialCurrency ?? "all");
    setSearch(initialSearch ?? "");
    setAmountMin(initialAmountMin ?? "");
    setAmountMax(initialAmountMax ?? "");
    setPreset(from || to ? "custom" : "all");
  }, [
    isOpen,
    initialAmountMax,
    initialAmountMin,
    initialCurrency,
    initialDateFrom,
    initialDateTo,
    initialSearch,
    initialStatus,
  ]);

  const handlePresetChange = useCallback((value: DateRangePreset) => {
    setPreset(value);
    // "Custom" only changes the label — the dates are typed in below.
    if (value === "custom") return;
    const { from, to } = resolveDateRangePreset(value);
    setDateFrom(from);
    setDateTo(to);
  }, []);

  // Touching a date input moves the preset to Custom, matching the filter bar.
  const handleDateChange = useCallback(
    (setter: (value: string) => void) => (value: string) => {
      setter(value);
      setPreset("custom");
    },
    [],
  );

  const rangeError = useMemo(
    () => validateDateRange(dateFrom, dateTo),
    [dateFrom, dateTo],
  );

  const handleExport = useCallback(async () => {
    if (rangeError) {
      toast.error(rangeError);
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading("Preparing your CSV export...");

    try {
      const result = await downloadTransactionsCsv(
        {
          status,
          currency,
          search: search.trim() || undefined,
          dateFrom,
          dateTo,
          amountMin,
          amountMax,
        },
        {
          onProgress: (elapsedMs) => {
            toast.loading(
              `Preparing your CSV export... (${Math.floor(elapsedMs / 1000)}s)`,
              { id: toastId },
            );
          },
        },
      );

      const rows =
        result.rowCount === null
          ? "Your CSV has been downloaded."
          : `${result.rowCount.toLocaleString()} transaction${
              result.rowCount === 1 ? "" : "s"
            } exported.`;

      toast.success(result.truncated ? `${rows} Capped at the export limit.` : rows, {
        id: toastId,
      });
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Export failed. Please try again.",
        { id: toastId },
      );
    } finally {
      setIsExporting(false);
    }
  }, [
    amountMax,
    amountMin,
    currency,
    dateFrom,
    dateTo,
    onClose,
    rangeError,
    search,
    status,
  ]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export transactions (CSV)">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Download every transaction in the selected range for accounting and
          reconciliation. Large exports stream straight to your browser, so
          there is no waiting on a background job.
        </p>

        <div className="space-y-2">
          <label
            htmlFor="export-date-preset"
            className="text-sm font-medium flex items-center gap-2"
          >
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Date range
          </label>
          <Select
            id="export-date-preset"
            className="w-full"
            value={preset}
            onChange={(e) => handlePresetChange(e.target.value as DateRangePreset)}
          >
            {DATE_RANGE_PRESETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                type="date"
                aria-label="Export start date"
                value={dateFrom}
                onChange={(e) => handleDateChange(setDateFrom)(e.target.value)}
              />
            </div>
            <span className="text-muted-foreground text-sm">–</span>
            <div className="flex-1">
              <Input
                type="date"
                aria-label="Export end date"
                value={dateTo}
                onChange={(e) => handleDateChange(setDateTo)(e.target.value)}
              />
            </div>
          </div>

          <p
            className={`text-xs ${rangeError ? "text-red-500" : "text-muted-foreground"}`}
            data-testid="export-date-range-summary"
          >
            {rangeError ?? describeDateRange(dateFrom, dateTo)}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="export-search" className="text-sm font-medium">
            Payment ID or customer email
          </label>
          <Input
            id="export-search"
            placeholder="Leave blank to export everything in range"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="export-status" className="text-sm font-medium">
              Status
            </label>
            <Select
              id="export-status"
              className="w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="export-currency" className="text-sm font-medium">
              Currency
            </label>
            <Select
              id="export-currency"
              className="w-full"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Amount range</span>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Min"
                aria-label="Minimum amount"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
              />
            </div>
            <span className="text-muted-foreground text-sm">–</span>
            <div className="flex-1">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Max"
                aria-label="Maximum amount"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            onClick={handleExport}
            disabled={isExporting || Boolean(rangeError)}
            data-testid="confirm-export-csv"
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
