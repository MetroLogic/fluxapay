"use client";

import React, { useState, useRef, JSX } from "react";
import {
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  Eye,
  Filter,
  Download,
  MoreVertical,
  Building,
  Calendar,
  DollarSign,
  RefreshCw,
  ExternalLink,
  ArrowUpRight,
  CreditCard,
  ChevronRight,
  SearchX,
} from "lucide-react";
import toast from "react-hot-toast";

// Type definitions
interface Settlement {
  id: string;
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed" | "manual_override";
  createdAt: string;
  fxRate: number;
  fees: {
    network: number;
    platform: number;
  };
  bankReference?: string;
  bankName?: string;
  bankAccountNumber?: string;
  paymentsIncluded: {
    id: string;
    amount: number;
    date: string;
  }[];
}

interface StatusConfig {
  color: string;
  bg: string;
  border: string;
  icon: JSX.Element;
  label: string;
}

const AdminSettlementsPage = () => {
  const primaryColor = "oklch(0.205 0 0)";
  const primaryLight = "oklch(0.93 0 0)";
  const accentPurple = "oklch(0.627 0.265 303.9)";

  // Sample data
  const [settlements, setSettlements] = useState<Settlement[]>([
    {
      id: "SET-9921-X",
      merchantId: "M001",
      merchantName: "TechStore Inc",
      amount: 450000,
      currency: "NGN",
      status: "pending",
      createdAt: "2024-03-24 10:30",
      fxRate: 1550.45,
      fees: {
        network: 2.5,
        platform: 15.0,
      },
      bankName: "Access Bank",
      bankAccountNumber: "0123456789",
      paymentsIncluded: [
        { id: "PAY-001", amount: 200, date: "2024-03-23" },
        { id: "PAY-002", amount: 150, date: "2024-03-23" },
      ],
    },
    {
      id: "SET-9922-Y",
      merchantId: "M002",
      merchantName: "Fashion Hub",
      amount: 125000,
      currency: "KHS",
      status: "completed",
      createdAt: "2024-03-23 15:45",
      fxRate: 132.1,
      fees: {
        network: 1.2,
        platform: 8.0,
      },
      bankReference: "FT-998273615",
      bankName: "KCB Bank",
      bankAccountNumber: "9876543210",
      paymentsIncluded: [{ id: "PAY-005", amount: 450, date: "2024-03-22" }],
    },
    {
      id: "SET-9923-Z",
      merchantId: "M004",
      merchantName: "Digital Services Co",
      amount: 75000,
      currency: "GHS",
      status: "failed",
      createdAt: "2024-03-22 09:12",
      fxRate: 13.4,
      fees: {
        network: 0.5,
        platform: 4.5,
      },
      bankName: "GT Bank",
      bankAccountNumber: "1122334455",
      paymentsIncluded: [{ id: "PAY-010", amount: 100, date: "2024-03-21" }],
    },
    {
      id: "SET-9924-A",
      merchantId: "M005",
      merchantName: "E-Commerce Plus",
      amount: 890000,
      currency: "NGN",
      status: "processing",
      createdAt: "2024-03-24 08:00",
      fxRate: 1550.45,
      fees: {
        network: 5.0,
        platform: 25.0,
      },
      bankName: "UBA",
      bankAccountNumber: "5544332211",
      paymentsIncluded: [{ id: "PAY-012", amount: 600, date: "2024-03-23" }],
    },
  ]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSettlement, setSelectedSettlement] =
    useState<Settlement | null>(null);

  const getStatusConfig = (status: Settlement["status"]): StatusConfig => {
    switch (status) {
      case "completed":
        return {
          color: "text-emerald-700",
          bg: "bg-emerald-50",
          border: "border-emerald-200",
          icon: <CheckCircle className="w-3.5 h-3.5" />,
          label: "Paid",
        };
      case "pending":
        return {
          color: "text-amber-700",
          bg: "bg-amber-50",
          border: "border-amber-200",
          icon: <Clock className="w-3.5 h-3.5" />,
          label: "Pending",
        };
      case "processing":
        return {
          color: "text-blue-700",
          bg: "bg-blue-50",
          border: "border-blue-200",
          icon: <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />,
          label: "Processing",
        };
      case "failed":
        return {
          color: "text-rose-700",
          bg: "bg-rose-50",
          border: "border-rose-200",
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          label: "Failed",
        };
      case "manual_override":
        return {
          color: "text-indigo-700",
          bg: "bg-indigo-50",
          border: "border-indigo-200",
          icon: <CheckCircle className="w-3.5 h-3.5" />,
          label: "Manual",
        };
      default:
        return {
          color: "text-slate-600",
          bg: "bg-slate-50",
          border: "border-slate-200",
          icon: <Clock className="w-3.5 h-3.5" />,
          label: status,
        };
    }
  };

  const handleAction = (id: string, action: string) => {
    setSettlements((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          if (action === "approve") return { ...s, status: "processing" };
          if (action === "mark_paid")
            return {
              ...s,
              status: "manual_override",
              bankReference: "MANUAL-" + Date.now(),
            };
          if (action === "retry") return { ...s, status: "processing" };
        }
        return s;
      }),
    );
    toast.success(`Settlement ${id} updated: ${action}`);
    if (selectedSettlement?.id === id) {
      setSelectedSettlement((prev) =>
        prev
          ? {
              ...prev,
              status:
                action === "approve" || action === "retry"
                  ? "processing"
                  : "manual_override",
            }
          : null,
      );
    }
  };

  const filteredSettlements = settlements.filter((s) => {
    const matchesSearch =
      s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.merchantName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    totalPending: settlements.filter((s) => s.status === "pending").length,
    totalVolume: settlements
      .filter((s) => s.status === "completed" || s.status === "manual_override")
      .reduce((acc, curr) => acc + curr.amount, 0),
    failedCount: settlements.filter((s) => s.status === "failed").length,
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white uppercase tracking-wider">
                  Admin
                </span>
                <h1 className="text-xl font-bold text-slate-900">
                  Settlement Operations
                </h1>
              </div>
              <p className="text-sm text-slate-500 font-medium">
                Review and process fiat payouts to merchants
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {[
            {
              label: "Pending Payouts",
              value: stats.totalPending,
              icon: Clock,
              color: "text-amber-600",
              bg: "bg-amber-50",
            },
            {
              label: "Failed Settlements",
              value: stats.failedCount,
              icon: AlertTriangle,
              color: "text-rose-600",
              bg: "bg-rose-50",
            },
            {
              label: "Today's Completed",
              value: settlements.filter((s) => s.status === "completed").length,
              icon: CheckCircle,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5"
            >
              <div className={`p-3 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-0.5">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5" />
            <input
              type="text"
              placeholder="Search by ID or merchant name..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-400 transition-all font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <select
                className="pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/5 appearance-none cursor-pointer"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200">
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Settlement ID
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Merchant
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSettlements.map((s) => {
                  const config = getStatusConfig(s.status);
                  return (
                    <tr
                      key={s.id}
                      className="group hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">
                            {s.id}
                          </span>
                          {s.bankReference && (
                            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                              REF: {s.bankReference}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-900">
                            {s.merchantName}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {s.merchantId}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-extrabold text-slate-900">
                            {s.amount.toLocaleString()} {s.currency}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            Rate: {s.fxRate}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${config.bg} ${config.color} ${config.border}`}
                        >
                          {config.icon}
                          {config.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-600">
                          {s.createdAt}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedSettlement(s)}
                            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-200 hover:shadow-sm"
                            title="View Details"
                          >
                            <Eye className="w-4.5 h-4.5" />
                          </button>
                          <div className="relative group/actions">
                            <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-200 hover:shadow-sm">
                              <MoreVertical className="w-4.5 h-4.5" />
                            </button>
                            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 invisible group-hover/actions:opacity-100 group-hover/actions:visible transition-all z-20 overflow-hidden translate-y-2 group-hover/actions:translate-y-0">
                              <div className="py-1">
                                {s.status === "pending" && (
                                  <button
                                    onClick={() =>
                                      handleAction(s.id, "approve")
                                    }
                                    className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    Approve Settlement
                                  </button>
                                )}
                                {s.status === "failed" && (
                                  <button
                                    onClick={() => handleAction(s.id, "retry")}
                                    className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <RefreshCw className="w-4 h-4 text-blue-500" />
                                    Retry Attempt
                                  </button>
                                )}
                                {(s.status === "pending" ||
                                  s.status === "processing" ||
                                  s.status === "failed") && (
                                  <button
                                    onClick={() =>
                                      handleAction(s.id, "mark_paid")
                                    }
                                    className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100"
                                  >
                                    <DollarSign className="w-4 h-4 text-indigo-500" />
                                    Mark as Paid (Manual)
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredSettlements.length === 0 && (
            <div className="py-20 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-50 text-slate-300 mb-4">
                <SearchX className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                No settlements found
              </h3>
              <p className="text-sm text-slate-500 max-w-xs mx-auto mt-1 font-medium">
                No results match your current search or filters.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {selectedSettlement && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 border border-white/20">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white relative overflow-hidden">
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-900 shadow-lg shadow-slate-200">
                  <Building className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    {selectedSettlement.merchantName}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter tracking-wider">
                      {selectedSettlement.id}
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-300" />
                    <span className="text-[11px] font-bold text-[#6366F1] bg-[#6366F1]/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-[#6366F1]/20 transition-colors">
                      {selectedSettlement.merchantId}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedSettlement(null)}
                className="p-3 hover:bg-slate-50 rounded-2xl transition-all relative z-10 border border-slate-100"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="space-y-8">
                {/* Amount & Status Highlight */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#F8FAFC] rounded-3xl p-6 border border-slate-200/60 shadow-inner group transition-all">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 opacity-70">
                      Payout Amount
                    </p>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-3xl font-black text-slate-900">
                        {selectedSettlement.amount.toLocaleString()}
                      </h3>
                      <span className="text-sm font-bold text-slate-400">
                        {selectedSettlement.currency}
                      </span>
                    </div>
                  </div>
                  <div className="bg-[#F8FAFC] rounded-3xl p-6 border border-slate-200/60 shadow-inner flex flex-col justify-between">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 opacity-70">
                      Current Status
                    </p>
                    <div className="flex items-center">
                      {(() => {
                        const cfg = getStatusConfig(selectedSettlement.status);
                        return (
                          <span
                            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black border-2 ${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm`}
                          >
                            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                            {cfg.label.toUpperCase()}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Bank Details - "Slick and flow with landing page" vibe */}
                <div className="relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 opacity-[0.98]" />
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#B86ADF] rounded-full blur-[80px] opacity-20 -translate-y-1/2 translate-x-1/2" />
                  <div className="relative p-8 rounded-3xl border border-white/5 flex items-center justify-between">
                    <div className="space-y-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
                          <CreditCard className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">
                          Destination Account
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 opacity-60">
                            Bank Name
                          </p>
                          <p className="text-sm font-black text-white">
                            {selectedSettlement.bankName || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 opacity-60">
                            Account Number
                          </p>
                          <p className="text-sm font-black text-white tracking-widest">
                            {selectedSettlement.bankAccountNumber || "N/A"}
                          </p>
                        </div>
                        {selectedSettlement.bankReference && (
                          <div className="col-span-2 pt-2 border-t border-white/5">
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5 opacity-80">
                              Payment Reference
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-mono font-black text-white">
                                {selectedSettlement.bankReference}
                              </p>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-500 cursor-pointer hover:text-white transition-colors" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <div className="w-24 h-24 rounded-full border-[10px] border-white/5 flex items-center justify-center relative">
                        <ArrowUpRight className="w-8 h-8 text-white/20 group-hover:text-white/40 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-500" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                    Financial Breakdown
                    <div className="h-px flex-1 bg-slate-100" />
                  </h3>
                  <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-500">
                        FX Conversion Rate
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        1 USDC = {selectedSettlement.fxRate}{" "}
                        {selectedSettlement.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-bold border-t border-slate-100 pt-4">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Platform Fees</span>
                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="text-slate-500">Network </span>
                      </div>
                      <span className="text-slate-900">
                        -
                        {selectedSettlement.fees.platform +
                          selectedSettlement.fees.network}{" "}
                        USDC
                      </span>
                    </div>
                  </div>
                </div>

                {/* Included Payments */}
                <div className="space-y-4 pb-4">
                  <div className="flex justify-between items-end">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                      Included Payments
                    </h3>
                    <span className="text-[10px] font-black text-slate-400">
                      {selectedSettlement.paymentsIncluded.length} TRANSACTIONS
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedSettlement.paymentsIncluded.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 hover:shadow-sm transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-slate-900 transition-colors">
                            <DollarSign className="w-4.5 h-4.5 text-slate-400 group-hover:text-white transition-colors" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              {p.id}
                            </p>
                            <p className="text-[11px] font-medium text-slate-400">
                              {p.date}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-slate-900">
                          +{p.amount} USDC
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-3">
              {selectedSettlement.status === "pending" ? (
                <>
                  <button
                    onClick={() =>
                      handleAction(selectedSettlement.id, "approve")
                    }
                    className="w-full sm:flex-1 py-4 bg-slate-900 text-white rounded-2xl text-sm font-black hover:opacity-90 transition-all shadow-lg shadow-slate-200 transform active:scale-[0.98]"
                  >
                    Approve & Start Payout
                  </button>
                  <button
                    onClick={() =>
                      handleAction(selectedSettlement.id, "mark_paid")
                    }
                    className="w-full sm:w-auto px-6 py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl text-sm font-black hover:bg-slate-50 transition-all transition-all"
                  >
                    Manual Override
                  </button>
                </>
              ) : selectedSettlement.status === "failed" ? (
                <button
                  onClick={() => handleAction(selectedSettlement.id, "retry")}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl text-sm font-black hover:opacity-90 transition-all shadow-lg"
                >
                  Retry Payout Attempt
                </button>
              ) : (
                <button
                  onClick={() => setSelectedSettlement(null)}
                  className="w-full py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl text-sm font-black hover:bg-slate-50 transition-all"
                >
                  Close Details
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
};

export default AdminSettlementsPage;
