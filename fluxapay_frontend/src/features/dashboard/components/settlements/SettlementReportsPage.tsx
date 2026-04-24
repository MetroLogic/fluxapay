"use client";

import { useState, useMemo } from "react";
import { subDays, startOfDay, format } from "date-fns";
import { Download, FileText, TrendingUp, DollarSign, Eye } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

interface Settlement {
  id: string;
  date: string;
  status: "completed" | "pending" | "failed";
  usdcAmount: number;
  fiatAmount: number;
  currency: string;
  fees: number;
  paymentsCount: number;
  bankReference: string;
  conversionRate: number;
}

interface SettlementDetails {
  id: string;
  date: string;
  status: "completed" | "pending" | "failed";
  usdcAmount: number;
  fiatAmount: number;
  currency: string;
  fees: number;
  netAmount: number;
  paymentsCount: number;
  bankReference: string;
  conversionRate: number;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    customer_email: string;
    created_at: string;
  }>;
}

const MOCK_SETTLEMENTS: Settlement[] = [
  {
    id: "set_001",
    date: "2026-02-20",
    status: "completed",
    usdcAmount: 5000,
    fiatAmount: 4950,
    currency: "USD",
    fees: 50,
    paymentsCount: 12,
    bankReference: "BANK-20260220-001",
    conversionRate: 0.99,
  },
  {
    id: "set_002",
    date: "2026-02-19",
    status: "completed",
    usdcAmount: 3200,
    fiatAmount: 3168,
    currency: "USD",
    fees: 32,
    paymentsCount: 8,
    bankReference: "BANK-20260219-001",
    conversionRate: 0.99,
  },
  {
    id: "set_003",
    date: "2026-02-18",
    status: "pending",
    usdcAmount: 2100,
    fiatAmount: 2079,
    currency: "USD",
    fees: 21,
    paymentsCount: 5,
    bankReference: "BANK-20260218-001",
    conversionRate: 0.99,
  },
];

const MOCK_SETTLEMENT_DETAILS: SettlementDetails = {
  id: "set_001",
  date: "2026-02-20",
  status: "completed",
  usdcAmount: 5000,
  fiatAmount: 4950,
  currency: "USD",
  fees: 50,
  netAmount: 4900,
  paymentsCount: 12,
  bankReference: "BANK-20260220-001",
  conversionRate: 0.99,
  payments: [
    {
      id: "pay_001",
      amount: 500,
      currency: "USDC",
      customer_email: "customer1@example.com",
      created_at: "2026-02-20T10:30:00Z",
    },
    {
      id: "pay_002",
      amount: 300,
      currency: "USDC",
      customer_email: "customer2@example.com",
      created_at: "2026-02-20T11:15:00Z",
    },
    {
      id: "pay_003",
      amount: 450,
      currency: "USDC",
      customer_email: "customer3@example.com",
      created_at: "2026-02-20T12:00:00Z",
    },
  ],
};

export function SettlementReportsPage() {
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "90days">("30days");
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    let start = new Date();

    if (dateRange === "7days") {
      start = startOfDay(subDays(end, 7));
    } else if (dateRange === "30days") {
      start = startOfDay(subDays(end, 30));
    } else if (dateRange === "90days") {
      start = startOfDay(subDays(end, 90));
    }

    return { startDate: start, endDate: end };
  }, [dateRange]);

  const filteredSettlements = MOCK_SETTLEMENTS.filter((s) => {
    const settlementDate = new Date(s.date);
    return settlementDate >= startDate && settlementDate <= endDate;
  });

  const stats = useMemo(() => {
    const completed = filteredSettlements.filter((s) => s.status === "completed");
    const totalUsdc = completed.reduce((sum, s) => sum + s.usdcAmount, 0);
    const totalFiat = completed.reduce((sum, s) => sum + s.fiatAmount, 0);
    const totalFees = completed.reduce((sum, s) => sum + s.fees, 0);

    return {
      totalSettlements: filteredSettlements.length,
      completedSettlements: completed.length,
      totalUsdc,
      totalFiat,
      totalFees,
      avgFeePercent: completed.length > 0 ? ((totalFees / totalUsdc) * 100).toFixed(2) : "0",
    };
  }, [filteredSettlements]);

  const handleDownloadCSV = async () => {
    try {
      setIsLoading(true);
      const blob = await api.settlements.exportRange({
        date_from: startDate.toISOString(),
        date_to: endDate.toISOString(),
        format: "csv",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `settlements-${format(startDate, "yyyy-MM-dd")}-to-${format(endDate, "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("CSV downloaded successfully");
    } catch {
      toast.error("Failed to download CSV");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setIsLoading(true);
      const blob = await api.settlements.exportRange({
        date_from: startDate.toISOString(),
        date_to: endDate.toISOString(),
        format: "pdf",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `settlements-${format(startDate, "yyyy-MM-dd")}-to-${format(endDate, "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("PDF downloaded successfully");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = (settlement: Settlement) => {
    setSelectedSettlement({
      ...MOCK_SETTLEMENT_DETAILS,
      ...settlement,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="success">Completed</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
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
            disabled={isLoading}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={handleDownloadPDF}
            disabled={isLoading}
          >
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-muted-foreground">Total USDC</p>
          </div>
          <p className="text-2xl font-bold">{stats.totalUsdc.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{stats.completedSettlements} completed</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <p className="text-sm text-muted-foreground">Total Fiat</p>
          </div>
          <p className="text-2xl font-bold">${stats.totalFiat.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">After conversion</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <p className="text-sm text-muted-foreground">Total Fees</p>
          </div>
          <p className="text-2xl font-bold">${stats.totalFees.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{stats.avgFeePercent}% avg</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-purple-600" />
            <p className="text-sm text-muted-foreground">Settlements</p>
          </div>
          <p className="text-2xl font-bold">{stats.totalSettlements}</p>
          <p className="text-xs text-muted-foreground mt-1">In period</p>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <label className="text-sm font-medium text-slate-900 mb-2 block">Date Range</label>
        <div className="flex gap-2">
          {(["7days", "30days", "90days"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                dateRange === range
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {range === "7days" ? "Last 7 days" : range === "30days" ? "Last 30 days" : "Last 90 days"}
            </button>
          ))}
        </div>
      </div>

      {/* Settlements Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-slate-500">Date</th>
                <th className="text-left py-3 px-4 font-medium text-slate-500">Status</th>
                <th className="text-right py-3 px-4 font-medium text-slate-500">USDC Amount</th>
                <th className="text-right py-3 px-4 font-medium text-slate-500">Fiat Amount</th>
                <th className="text-right py-3 px-4 font-medium text-slate-500">Fees</th>
                <th className="text-center py-3 px-4 font-medium text-slate-500">Payments</th>
                <th className="text-center py-3 px-4 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSettlements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No settlements found for this period
                  </td>
                </tr>
              ) : (
                filteredSettlements.map((settlement) => (
                  <tr key={settlement.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-slate-900">
                      {format(new Date(settlement.date), "MMM d, yyyy")}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(settlement.status)}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900">
                      {settlement.usdcAmount.toLocaleString()} USDC
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900">
                      ${settlement.fiatAmount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500">
                      ${settlement.fees.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-900">
                      {settlement.paymentsCount}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleViewDetails(settlement)}
                        className="text-amber-600 hover:text-amber-700 font-medium text-sm"
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
        isOpen={!!selectedSettlement}
        onClose={() => setSelectedSettlement(null)}
        title="Settlement Details"
      >
        {selectedSettlement && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Settlement ID</p>
                <p className="font-mono text-sm font-medium">{selectedSettlement.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Date</p>
                <p className="text-sm font-medium">
                  {format(new Date(selectedSettlement.date), "MMM d, yyyy")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <div>{getStatusBadge(selectedSettlement.status)}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Bank Reference</p>
                <p className="font-mono text-sm">{selectedSettlement.bankReference}</p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-semibold text-slate-900 mb-3">Amount Breakdown</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">USDC Received</span>
                  <span className="font-mono font-medium">
                    {selectedSettlement.usdcAmount.toLocaleString()} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Conversion Rate</span>
                  <span className="font-mono font-medium">{selectedSettlement.conversionRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Fees</span>
                  <span className="font-mono font-medium text-red-600">
                    -${selectedSettlement.fees.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between">
                  <span className="font-semibold text-slate-900">Net Amount</span>
                  <span className="font-mono font-bold text-green-600">
                    ${selectedSettlement.netAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Payments */}
            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-semibold text-slate-900 mb-3">
                Included Payments ({selectedSettlement.paymentsCount})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedSettlement.payments.map((payment) => (
                  <div key={payment.id} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                    <div>
                      <p className="font-mono text-xs text-slate-500">{payment.id}</p>
                      <p className="text-slate-600">{payment.customer_email}</p>
                    </div>
                    <span className="font-mono font-medium">
                      {payment.amount} {payment.currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
