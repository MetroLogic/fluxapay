import { Badge } from "@/components/Badge";
import { DataTableBodyState } from "@/components/data-table";
import { VirtualizedTable } from "@/components/VirtualizedTable";
import { Payment, PaymentStatus } from "./types";
import { ChevronDown, ChevronUp, Copy, Eye, ExternalLink } from "lucide-react";
import { useState, useMemo, memo, useCallback } from "react";
import { getStellarExpertTxUrl } from "@/lib/stellar";

interface PaymentsTableProps {
  payments: Payment[];
  onRowClick: (payment: Payment) => void;
  isLoading?: boolean;
  error?: string | null;
}

interface SortIconProps {
  column: keyof Payment;
  sortConfig: {
    key: keyof Payment;
    direction: "asc" | "desc";
  } | null;
}

const SortIcon = memo(({ column, sortConfig }: SortIconProps) => {
  if (sortConfig?.key !== column)
    return <ChevronDown className="h-4 w-4 opacity-30" />;
  return sortConfig.direction === "asc" ? (
    <ChevronUp className="h-4 w-4" />
  ) : (
    <ChevronDown className="h-4 w-4" />
  );
});
SortIcon.displayName = "SortIcon";

const StatusBadge = memo(({ status }: { status: PaymentStatus }) => {
  switch (status) {
    case "confirmed":
      return <Badge variant="success">Confirmed</Badge>;
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "failed":
      return <Badge variant="error">Failed</Badge>;
    case "expired":
      return <Badge variant="secondary">Expired</Badge>;
    case "paid":
    case "completed":
      return <Badge variant="success">{status === "paid" ? "Paid" : "Completed"}</Badge>;
    case "partially_paid":
      return (
        <Badge className="border-transparent bg-orange-500/10 text-orange-500 hover:bg-orange-500/20">
          Partially Paid
        </Badge>
      );
    case "overpaid":
      return <Badge variant="info">Overpaid</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
});
StatusBadge.displayName = "StatusBadge";

interface PaymentRowProps {
  payment: Payment;
  onRowClick: (payment: Payment) => void;
}

const PaymentRow = memo(({ payment, onRowClick }: PaymentRowProps) => {
  const handleCopyId = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(payment.id);
    },
    [payment.id],
  );

  const handleViewDetails = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRowClick(payment);
    },
    [payment, onRowClick],
  );

  const handleRowClick = useCallback(() => {
    onRowClick(payment);
  }, [payment, onRowClick]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRowClick(payment);
      }
    },
    [payment, onRowClick],
  );

  const formattedDate = useMemo(
    () => new Date(payment.createdAt).toLocaleDateString(),
    [payment.createdAt],
  );

  const formattedAmount = useMemo(
    () => `${payment.amount.toLocaleString()} ${payment.currency}`,
    [payment.amount, payment.currency],
  );

  const fiatDisplay = useMemo(() => {
    if (payment.fiatEquivalent != null && payment.fiatCurrency) {
      return `≈ ${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: payment.fiatCurrency,
      }).format(payment.fiatEquivalent)}`;
    }
    return null;
  }, [payment.fiatEquivalent, payment.fiatCurrency]);

  const txUrl = useMemo(() => {
    if (payment.stellarExpertUrl) return payment.stellarExpertUrl;
    if (payment.txHash) return getStellarExpertTxUrl(payment.txHash);
    return null;
  }, [payment.stellarExpertUrl, payment.txHash]);

  return (
    <tr
      role="row"
      tabIndex={0}
      className="group hover:bg-muted/50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset"
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      aria-label={`Payment ${payment.id}, ${formattedAmount}, ${payment.status}`}
    >
      <td role="cell" className="px-4 py-4 font-mono text-xs">
        {payment.id}
      </td>
      <td role="cell" className="px-4 py-4">
        <div className="flex flex-col">
          <span className="font-semibold uppercase">{formattedAmount}</span>
          {fiatDisplay && (
            <span className="text-xs text-muted-foreground">{fiatDisplay}</span>
          )}
        </div>
      </td>
      <td role="cell" className="px-4 py-4">
        <StatusBadge status={payment.status} />
      </td>
      <td role="cell" className="px-4 py-4">
        <div className="flex flex-col">
          <span className="font-medium">{payment.customerName}</span>
          <span className="text-xs text-muted-foreground">
            {payment.customerEmail}
          </span>
        </div>
      </td>
      <td role="cell" className="px-4 py-4 text-right tabular-nums text-muted-foreground">
        {formattedDate}
      </td>
      <td role="cell" className="px-4 py-4">
        {payment.txHash ? (
          <a
            href={txUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
            aria-label={`View transaction ${payment.txHash} on Stellar Expert`}
          >
            {payment.txHash.slice(0, 8)}…{payment.txHash.slice(-4)}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td role="cell" className="px-4 py-4 text-center">
        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
          <button
            className="p-1 hover:bg-muted rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            title="View Details"
            aria-label={`View details for payment ${payment.id}`}
            onClick={handleViewDetails}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            className="p-1 hover:bg-muted rounded text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            title="Copy ID"
            aria-label={`Copy payment ID ${payment.id}`}
            onClick={handleCopyId}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});
PaymentRow.displayName = "PaymentRow";

export const PaymentsTable = ({
  payments,
  onRowClick,
  isLoading = false,
  error = null,
}: PaymentsTableProps) => {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Payment;
    direction: "asc" | "desc";
  } | null>(null);

  const handleSort = useCallback((key: keyof Payment) => {
    setSortConfig((prev) => {
      if (prev?.key === key && prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      return { key, direction: "asc" };
    });
  }, []);

  const sortedPayments = useMemo(() => {
    if (!sortConfig) return payments;

    return [...payments].sort((a, b) => {
      const { key, direction } = sortConfig;
      if (a[key]! < b[key]!) return direction === "asc" ? -1 : 1;
      if (a[key]! > b[key]!) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [payments, sortConfig]);

  // Use virtualized table for large datasets
  const shouldVirtualize = sortedPayments.length > 100;

  if (shouldVirtualize && sortedPayments.length > 0 && !isLoading && !error) {
    return (
      <div className="bg-card overflow-hidden rounded-lg border" role="region" aria-label="Payments table">
        <div className="border-b bg-muted/50">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" role="table">
              <thead>
                <tr role="row" className="transition-colors">
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 font-medium cursor-pointer flex items-center gap-1"
                    onClick={() => handleSort("id")}
                    aria-sort={sortConfig?.key === "id" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("id"); } }}
                  >
                    Charge ID <SortIcon column="id" sortConfig={sortConfig} />
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 font-medium cursor-pointer"
                    onClick={() => handleSort("amount")}
                    aria-sort={sortConfig?.key === "amount" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("amount"); } }}
                  >
                    <div className="flex items-center gap-1">
                      Amount (USDC + Fiat) <SortIcon column="amount" sortConfig={sortConfig} />
                    </div>
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 font-medium cursor-pointer"
                    onClick={() => handleSort("status")}
                    aria-sort={sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("status"); } }}
                  >
                    <div className="flex items-center gap-1">
                      Status <SortIcon column="status" sortConfig={sortConfig} />
                    </div>
                  </th>
                  <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Customer</th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 font-medium cursor-pointer text-right"
                    onClick={() => handleSort("createdAt")}
                    aria-sort={sortConfig?.key === "createdAt" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("createdAt"); } }}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Created At <SortIcon column="createdAt" sortConfig={sortConfig} />
                    </div>
                  </th>
                  <th role="columnheader" scope="col" className="px-4 py-3 font-medium">
                    Stellar TX Hash
                  </th>
                  <th role="columnheader" scope="col" className="px-4 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
            </table>
          </div>
        </div>
        <VirtualizedTable
          data={sortedPayments}
          rowHeight={56}
          containerHeight={600}
          renderRow={(payment) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left" role="table">
                <tbody className="divide-y">
                  <PaymentRow
                    payment={payment}
                    onRowClick={onRowClick}
                  />
                </tbody>
              </table>
            </div>
          )}
          className="divide-y"
        />
      </div>
    );
  }

  return (
    <div className="bg-card overflow-hidden" role="region" aria-label="Payments table">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left" role="table" aria-label="Payment charges">
          <thead>
            <tr role="row" className="border-b bg-muted/50 transition-colors">
              <th
                role="columnheader"
                scope="col"
                className="px-4 py-3 font-medium cursor-pointer flex items-center gap-1"
                onClick={() => handleSort("id")}
                aria-sort={sortConfig?.key === "id" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("id"); } }}
              >
                Charge ID <SortIcon column="id" sortConfig={sortConfig} />
              </th>
              <th
                role="columnheader"
                scope="col"
                className="px-4 py-3 font-medium cursor-pointer"
                onClick={() => handleSort("amount")}
                aria-sort={sortConfig?.key === "amount" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("amount"); } }}
              >
                <div className="flex items-center gap-1">
                  Amount (USDC + Fiat) <SortIcon column="amount" sortConfig={sortConfig} />
                </div>
              </th>
              <th
                role="columnheader"
                scope="col"
                className="px-4 py-3 font-medium cursor-pointer"
                onClick={() => handleSort("status")}
                aria-sort={sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("status"); } }}
              >
                <div className="flex items-center gap-1">
                  Status <SortIcon column="status" sortConfig={sortConfig} />
                </div>
              </th>
              <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Customer</th>
              <th
                role="columnheader"
                scope="col"
                className="px-4 py-3 font-medium cursor-pointer text-right"
                onClick={() => handleSort("createdAt")}
                aria-sort={sortConfig?.key === "createdAt" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("createdAt"); } }}
              >
                <div className="flex items-center justify-end gap-1">
                  Created At <SortIcon column="createdAt" sortConfig={sortConfig} />
                </div>
              </th>
              <th role="columnheader" scope="col" className="px-4 py-3 font-medium">
                Stellar TX Hash
              </th>
              <th role="columnheader" scope="col" className="px-4 py-3 font-medium text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <DataTableBodyState
              colSpan={7}
              state={
                error
                  ? "error"
                  : isLoading
                    ? "loading"
                    : sortedPayments.length === 0
                      ? "empty"
                      : "ready"
              }
              errorMessage={error ?? undefined}
              emptyMessage="No payments found matching your filters."
            >
              {sortedPayments.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  onRowClick={onRowClick}
                />
              ))}
            </DataTableBodyState>
          </tbody>
        </table>
      </div>
    </div>
  );
};
