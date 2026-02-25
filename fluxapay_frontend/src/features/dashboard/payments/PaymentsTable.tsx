import { Badge } from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import { Payment, PaymentStatus } from "./payments-mock";
import { ChevronDown, ChevronUp, Copy, Eye } from "lucide-react";
import { useState } from "react";

interface PaymentsTableProps {
  payments: Payment[];
  onRowClick: (payment: Payment) => void;
}

interface SortIconProps {
  column: keyof Payment;
  sortConfig: {
    key: keyof Payment;
    direction: "asc" | "desc";
  } | null;
}

const SortIcon = ({ column, sortConfig }: SortIconProps) => {
  if (sortConfig?.key !== column)
    return <ChevronDown className="h-4 w-4 opacity-30" />;
  return sortConfig.direction === "asc" ? (
    <ChevronUp className="h-4 w-4" />
  ) : (
    <ChevronDown className="h-4 w-4" />
  );
};

export const PaymentsTable = ({ payments, onRowClick }: PaymentsTableProps) => {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Payment;
    direction: "asc" | "desc";
  } | null>(null);

  const handleSort = (key: keyof Payment) => {
    let direction: "asc" | "desc" = "asc";
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedPayments = [...payments].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    if (a[key]! < b[key]!) return direction === "asc" ? -1 : 1;
    if (a[key]! > b[key]!) return direction === "asc" ? 1 : -1;
    return 0;
  });

  const getStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case "confirmed":
        return <Badge variant="success">Confirmed</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      case "failed":
        return <Badge variant="error">Failed</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b bg-muted/50 transition-colors">
              <th
                className="px-4 py-3 font-medium cursor-pointer flex items-center gap-1"
                onClick={() => handleSort("id")}
              >
                Payment ID <SortIcon column="id" sortConfig={sortConfig} />
              </th>
              <th
                className="px-4 py-3 font-medium cursor-pointer"
                onClick={() => handleSort("amount")}
              >
                <div className="flex items-center gap-1">
                  Amount <SortIcon column="amount" sortConfig={sortConfig} />
                </div>
              </th>
              <th
                className="px-4 py-3 font-medium cursor-pointer"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center gap-1">
                  Status <SortIcon column="status" sortConfig={sortConfig} />
                </div>
              </th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Order ID</th>
              <th
                className="px-4 py-3 font-medium cursor-pointer text-right"
                onClick={() => handleSort("createdAt")}
              >
                <div className="flex items-center justify-end gap-1">
                  Date <SortIcon column="createdAt" sortConfig={sortConfig} />
                </div>
              </th>
              <th className="px-4 py-3 font-medium text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedPayments.length === 0 ? (
              <EmptyState
                colSpan={7}
                className="px-4 py-12 text-muted-foreground"
                message="No payments found matching your filters."
              />
            ) : (
              sortedPayments.map((payment) => (
                <tr
                  key={payment.id}
                  className="group hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onRowClick(payment)}
                >
                  <td className="px-4 py-4 font-mono text-xs">{payment.id}</td>
                  <td className="px-4 py-4 font-semibold uppercase">
                    {payment.amount.toLocaleString()} {payment.currency}
                  </td>
                  <td className="px-4 py-4">
                    {getStatusBadge(payment.status)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {payment.customerName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {payment.customerEmail}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">{payment.orderId}</td>
                  <td className="px-4 py-4 text-right tabular-nums text-muted-foreground">
                    {new Date(payment.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 hover:bg-muted rounded"
                        title="View Details"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(payment);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1 hover:bg-muted rounded text-primary"
                        title="Copy ID"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(payment.id);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
