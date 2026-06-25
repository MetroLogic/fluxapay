"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Download, FileText, TrendingUp, DollarSign, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { api } from "@/lib/api";
import {
  useSettlements,
  useSettlementDetails,
  useSettlementExport,
  type MerchantSettlement,
} from "@/hooks/useSettlements";
import toast from "react-hot-toast";

export function SettlementReportsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { settlements, isLoading, error } = useSettlements({
    status: statusFilter !== "all" ? statusFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    limit: 100,
  });

  const { detail: selectedDetail, isLoading: detailLoading } =
    useSettlementDetails(selectedSettlementId);

  const { download: downloadSingle, exporting: singleExporting } = useSettlementExport();

  const stats = useMemo(() => {
    const completed = settlements.filter((s) => s.status === "completed");
    const totalUsdc = completed.reduce((sum, s) => sum + s.usdcAmount, 0);
    const totalFiat = completed.reduce((sum, s) => sum + s.fiatAmount, 0);
    const totalFees = completed.reduce((sum, s) => sum + s.fees, 0);

    return {
      totalSettlements: settlements.length,
      completedSettlements: completed.length,
      totalUsdc,
      totalFiat,
      totalFees,
      avgFeePercent: completed.length > 0 ? ((totalFees / totalUsdc) * 100).toFixed(2) : "0",
    };
  }, [settlements]);

  const handleDownloadCSV = async () => {
    try {
      setIsExporting(true);
      const blob = await api.settlements.exportRange({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        format: "csv",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `settlements-report${dateFrom ? `-from-${dateFrom}` : ""}${dateTo ? `-to-${dateTo}` : ""}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("CSV downloaded successfully");
    } catch {
      toast.error("Failed to download CSV");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setIsExporting(true);
      const blob = await api.settlements.exportRange({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        format: "pdf",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `settlements-report${dateFrom ? `-from-${dateFrom}` : ""}${dateTo ? `-to-${dateTo}` : ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("PDF downloaded successfully");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const handleViewDetails = (settlement: MerchantSettlement) => {
    setSelectedSettlementId(settlement.id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="success">Completed</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      case "processing":
        return <Badge variant="info">Processing</Badge>;
      case "failed":
        return <Badge variant="error">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settlement Reports</h2>
          <p className="text-muted-foreground">
            View fiat settlement history and download reconciliation reports.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="gap-2"
            onClick={handleDownloadCSV}
            disabled={isExporting}
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            CSV
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={handleDownloadPDF}
            disabled={isExporting}
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-muted-foreground">Total USDC</p>
          </div>
          <p className="text-2xl font-bold">
            {isLoading ? "…" : stats.totalUsdc.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{stats.completedSettlements} completed</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <p className="text-sm text-muted-foreground">Total Fiat</p>
          </div>
          <p className="text-2xl font-bold">
            {isLoading ? "…" : `$${stats.totalFiat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">After conversion</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <p className="text-sm text-muted-foreground">Total Fees</p>
          </div>
          <p className="text-2xl font-bold">
            {isLoading ? "…" : `$${stats.totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{stats.avgFeePercent}% avg</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-purple-600" />
            <p className="text-sm text-muted-foreground">Settlements</p>
          </div>
          <p className="text-2xl font-bold">
            {isLoading ? "…" : stats.totalSettlements}
          </p>
          <p className="text-xs text-muted-foreground mt-1">In period</p>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <label className="text-sm font-medium mb-3 block">Filters</label>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Settlements Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">USDC Amount</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Fiat Amount</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Fees</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Payments</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading settlements…
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-red-500">
                    Failed to load settlements.
                  </td>
                </tr>
              ) : settlements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No settlements found for this period
                  </td>
                </tr>
              ) : (
                settlements.map((settlement) => (
                  <tr key={settlement.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">
                      {settlement.date
                        ? format(new Date(settlement.date), "MMM d, yyyy")
                        : "—"}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(settlement.status)}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      {settlement.usdcAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      ${settlement.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      ${settlement.fees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {settlement.paymentsCount}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleViewDetails(settlement)}
                        className="text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settlement Details Modal */}
      <Modal
        isOpen={!!selectedSettlementId}
        onClose={() => setSelectedSettlementId(null)}
        title="Settlement Details"
      >
        {detailLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading…</span>
          </div>
        )}

        {selectedDetail && !detailLoading && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Settlement ID</p>
                <p className="font-mono text-sm font-medium">{selectedDetail.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Date</p>
                <p className="text-sm font-medium">
                  {format(new Date(selectedDetail.created_at), "MMM d, yyyy")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <div>{getStatusBadge(selectedDetail.status)}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Bank Transfer</p>
                <p className="font-mono text-sm">{selectedDetail.bank_transfer_id ?? "—"}</p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Amount Breakdown</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">USDC Received</span>
                  <span className="font-mono font-medium">
                    {Number(selectedDetail.usdc_amount ?? selectedDetail.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exchange Rate</span>
                  <span className="font-mono font-medium">
                    {selectedDetail.exchange_rate ?? "1.00"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fees</span>
                  <span className="font-mono font-medium text-red-600">
                    -${Number(selectedDetail.fees).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="font-semibold">Net Amount</span>
                  <span className="font-mono font-bold text-green-600">
                    ${Number(selectedDetail.net_amount ?? Number(selectedDetail.amount) - Number(selectedDetail.fees)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Download buttons */}
            <div className="flex gap-2 border-t border-border pt-4">
              <Button
                variant="secondary"
                className="flex-1 gap-2"
                onClick={() => downloadSingle(selectedDetail.id, "csv")}
                disabled={singleExporting}
              >
                {singleExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                CSV
              </Button>
              <Button
                variant="secondary"
                className="flex-1 gap-2"
                onClick={() => downloadSingle(selectedDetail.id, "pdf")}
                disabled={singleExporting}
              >
                {singleExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                PDF
              </Button>
            </div>

            {/* Payments */}
            {selectedDetail.payments && selectedDetail.payments.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="font-semibold mb-3">
                  Included Payments ({selectedDetail.payments.length})
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedDetail.payments.map((payment) => (
                    <div key={payment.id} className="flex justify-between text-sm p-2 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{payment.id}</p>
                        <p className="text-foreground">{payment.customer_email}</p>
                      </div>
                      <span className="font-mono font-medium">
                        ${Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
