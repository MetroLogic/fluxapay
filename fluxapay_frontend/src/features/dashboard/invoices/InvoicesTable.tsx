import { Badge } from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import { Invoice, InvoiceStatus } from "./invoices-mock";
import { ChevronDown, ChevronUp, Copy, Eye } from "lucide-react";
import { useState } from "react";

interface InvoicesTableProps {
  invoices: Invoice[];
  onRowClick: (invoice: Invoice) => void;
}

interface SortIconProps {
  column: keyof Invoice;
  sortConfig: { key: keyof Invoice; direction: "asc" | "desc" } | null;
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

const getStatusBadge = (status: InvoiceStatus) => {
  switch (status) {
    case "paid":
      return <Badge variant="success">Paid</Badge>;
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "overdue":
      return <Badge variant="error">Overdue</Badge>;
    case "unpaid":
      return <Badge variant="secondary">Unpaid</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export const InvoicesTable = ({ invoices, onRowClick }: InvoicesTableProps) => {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Invoice;
    direction: "asc" | "desc";
  } | null>(null);

  const handleSort = (key: keyof Invoice) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sorted = [...invoices].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    if (a[key]! < b[key]!) return direction === "asc" ? -1 : 1;
    if (a[key]! > b[key]!) return direction === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b bg-muted/50 transition-colors">
              <th
                className="px-4 py-3 font-medium cursor-pointer"
                onClick={() => handleSort("invoice_number")}
              >
                <div className="flex items-center gap-1">
                  Invoice # <SortIcon column="invoice_number" sortConfig={sortConfig} />
                </div>
              </th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th
                className="px-4 py-3 font-medium cursor-pointer"
                onClick={() => handleSort("total_amount")}
              >
                <div className="flex items-center gap-1">
                  Amount <SortIcon column="total_amount" sortConfig={sortConfig} />
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
              <th
                className="px-4 py-3 font-medium cursor-pointer"
                onClick={() => handleSort("due_date")}
              >
                <div className="flex items-center gap-1">
                  Due Date <SortIcon column="due_date" sortConfig={sortConfig} />
                </div>
              </th>
              <th className="px-4 py-3 font-medium text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.length === 0 ? (
              <EmptyState
                colSpan={6}
                className="px-4 py-12 text-muted-foreground"
                message="No invoices found matching your filters."
              />
            ) : (
              sorted.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="group hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onRowClick(invoice)}
                >
                  <td className="px-4 py-4 font-mono text-xs">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium">{invoice.customer_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {invoice.customer_email}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold uppercase">
                    {invoice.total_amount.toLocaleString()} {invoice.currency}
                  </td>
                  <td className="px-4 py-4">{getStatusBadge(invoice.status)}</td>
                  <td className="px-4 py-4 tabular-nums text-muted-foreground">
                    {new Date(invoice.due_date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className="p-1 hover:bg-muted rounded"
                        title="View Details"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(invoice);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1 hover:bg-muted rounded text-primary"
                        title="Copy Payment Link"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(invoice.payment_link);
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
