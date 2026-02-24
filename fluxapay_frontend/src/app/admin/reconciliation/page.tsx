"use client";

import { useState, JSX } from "react";
import {
    Search,
    AlertTriangle,
    CheckCircle,
    Clock,
    X,
    Eye,
    Filter,
    Download,
    RefreshCw,
    Shield,
    Activity,
    TrendingUp,
    TrendingDown,
    BarChart3,
    Bell,
    BellOff,
    ChevronRight,
    FileText,
    Scale,
    Zap,
    ArrowUpRight,
    ArrowDownRight,
    Percent,
    Hash,
    Calendar,
    DollarSign,
    SearchX,
    Play,
    CheckCheck,
    Info,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────

interface ReconciliationRecord {
    id: string;
    period_start: string;
    period_end: string;
    total_usdc_swept: number;
    total_fiat_payouts: number;
    total_fees: number;
    expected_balance: number;
    actual_balance: number;
    discrepancy: number;
    discrepancy_percent: number;
    status: "pending" | "matched" | "discrepancy" | "reviewed" | "resolved";
    settlements_count: number;
    payments_count: number;
    notes?: string;
    reviewed_by?: string;
    reviewed_at?: string;
    alerts: ReconciliationAlert[];
    created_at: string;
}

interface ReconciliationAlert {
    id: string;
    alert_type: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    details?: Record<string, unknown>;
    acknowledged: boolean;
    acknowledged_by?: string;
    acknowledged_at?: string;
    created_at: string;
}

interface StatusConfig {
    color: string;
    bg: string;
    border: string;
    icon: JSX.Element;
    label: string;
    glow: string;
}

// ─── Mock Data ─────────────────────────────────────────────────────────

const mockReconciliations: ReconciliationRecord[] = [
    {
        id: "REC-2026-001",
        period_start: "2026-02-01",
        period_end: "2026-02-07",
        total_usdc_swept: 45200.00,
        total_fiat_payouts: 43950.00,
        total_fees: 904.00,
        expected_balance: 45200.00,
        actual_balance: 44854.00,
        discrepancy: 346.00,
        discrepancy_percent: 0.77,
        status: "matched",
        settlements_count: 12,
        payments_count: 189,
        alerts: [],
        created_at: "2026-02-08T00:15:00Z",
    },
    {
        id: "REC-2026-002",
        period_start: "2026-02-08",
        period_end: "2026-02-14",
        total_usdc_swept: 67850.00,
        total_fiat_payouts: 65100.00,
        total_fees: 1357.00,
        expected_balance: 67850.00,
        actual_balance: 65200.00,
        discrepancy: 2650.00,
        discrepancy_percent: 3.91,
        status: "discrepancy",
        settlements_count: 18,
        payments_count: 312,
        alerts: [
            {
                id: "ALT-001",
                alert_type: "threshold_exceeded",
                severity: "medium",
                message: "Discrepancy of 3.91% detected (2,650 USDC). Threshold is 1%.",
                acknowledged: false,
                created_at: "2026-02-15T00:20:00Z",
            },
            {
                id: "ALT-002",
                alert_type: "missing_settlement",
                severity: "high",
                message: "2 failed settlement(s) detected in period.",
                details: { failedSettlementIds: ["SET-9923-Z"], totalFailedAmount: 75000 },
                acknowledged: false,
                created_at: "2026-02-15T00:20:00Z",
            },
        ],
        created_at: "2026-02-15T00:15:00Z",
    },
    {
        id: "REC-2026-003",
        period_start: "2026-02-15",
        period_end: "2026-02-19",
        total_usdc_swept: 23400.00,
        total_fiat_payouts: 22750.00,
        total_fees: 468.00,
        expected_balance: 23400.00,
        actual_balance: 23218.00,
        discrepancy: 182.00,
        discrepancy_percent: 0.78,
        status: "pending",
        settlements_count: 8,
        payments_count: 94,
        alerts: [],
        created_at: "2026-02-20T00:15:00Z",
    },
    {
        id: "REC-2026-004",
        period_start: "2026-01-25",
        period_end: "2026-01-31",
        total_usdc_swept: 89500.00,
        total_fiat_payouts: 87100.00,
        total_fees: 1790.00,
        expected_balance: 89500.00,
        actual_balance: 88890.00,
        discrepancy: 610.00,
        discrepancy_percent: 0.68,
        status: "reviewed",
        settlements_count: 24,
        payments_count: 445,
        notes: "Minor rounding differences across FX conversions. Acceptable.",
        reviewed_by: "admin@fluxapay.com",
        reviewed_at: "2026-02-02T10:30:00Z",
        alerts: [
            {
                id: "ALT-003",
                alert_type: "fee_discrepancy",
                severity: "low",
                message: "Fee rate deviation detected: 2.01% vs expected 2.00%.",
                acknowledged: true,
                acknowledged_by: "admin@fluxapay.com",
                acknowledged_at: "2026-02-02T10:30:00Z",
                created_at: "2026-02-01T00:20:00Z",
            },
        ],
        created_at: "2026-02-01T00:15:00Z",
    },
];

// ─── Component ─────────────────────────────────────────────────────────

const AdminReconciliationPage = () => {
    const [records] = useState<ReconciliationRecord[]>(mockReconciliations);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedRecord, setSelectedRecord] = useState<ReconciliationRecord | null>(null);
    const [showRunModal, setShowRunModal] = useState(false);
    const [periodStart, setPeriodStart] = useState("");
    const [periodEnd, setPeriodEnd] = useState("");
    const [activeTab, setActiveTab] = useState<"overview" | "alerts">("overview");

    // ─── Helpers ────────────────────────────────────────────────────

    const getStatusConfig = (status: ReconciliationRecord["status"]): StatusConfig => {
        switch (status) {
            case "matched":
                return {
                    color: "text-emerald-700",
                    bg: "bg-emerald-50",
                    border: "border-emerald-200",
                    icon: <CheckCircle className="w-3.5 h-3.5" />,
                    label: "Matched",
                    glow: "shadow-emerald-100",
                };
            case "pending":
                return {
                    color: "text-amber-700",
                    bg: "bg-amber-50",
                    border: "border-amber-200",
                    icon: <Clock className="w-3.5 h-3.5" />,
                    label: "Pending",
                    glow: "shadow-amber-100",
                };
            case "discrepancy":
                return {
                    color: "text-rose-700",
                    bg: "bg-rose-50",
                    border: "border-rose-200",
                    icon: <AlertTriangle className="w-3.5 h-3.5" />,
                    label: "Discrepancy",
                    glow: "shadow-rose-100",
                };
            case "reviewed":
                return {
                    color: "text-blue-700",
                    bg: "bg-blue-50",
                    border: "border-blue-200",
                    icon: <Eye className="w-3.5 h-3.5" />,
                    label: "Reviewed",
                    glow: "shadow-blue-100",
                };
            case "resolved":
                return {
                    color: "text-indigo-700",
                    bg: "bg-indigo-50",
                    border: "border-indigo-200",
                    icon: <CheckCheck className="w-3.5 h-3.5" />,
                    label: "Resolved",
                    glow: "shadow-indigo-100",
                };
            default:
                return {
                    color: "text-slate-600",
                    bg: "bg-slate-50",
                    border: "border-slate-200",
                    icon: <Clock className="w-3.5 h-3.5" />,
                    label: status,
                    glow: "",
                };
        }
    };

    const getSeverityConfig = (severity: ReconciliationAlert["severity"]) => {
        switch (severity) {
            case "critical":
                return { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" };
            case "high":
                return { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" };
            case "medium":
                return { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" };
            case "low":
                return { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-400" };
            default:
                return { color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", dot: "bg-slate-400" };
        }
    };

    const filteredRecords = records.filter((r) => {
        const matchesSearch = r.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "all" || r.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const allAlerts = records.flatMap((r) => r.alerts.map((a) => ({ ...a, reconciliationId: r.id })));
    const unresolvedAlerts = allAlerts.filter((a) => !a.acknowledged);

    const stats = {
        totalRecords: records.length,
        matchedCount: records.filter((r) => r.status === "matched").length,
        discrepancyCount: records.filter((r) => r.status === "discrepancy").length,
        unresolvedAlerts: unresolvedAlerts.length,
        avgDiscrepancy: records.length > 0 ? records.reduce((sum, r) => sum + r.discrepancy_percent, 0) / records.length : 0,
        totalSwept: records.reduce((sum, r) => sum + r.total_usdc_swept, 0),
    };

    const handleRunReconciliation = () => {
        if (!periodStart || !periodEnd) {
            toast.error("Please select both start and end dates");
            return;
        }
        toast.success("Reconciliation started for period " + periodStart + " to " + periodEnd);
        setShowRunModal(false);
        setPeriodStart("");
        setPeriodEnd("");
    };

    const handleAcknowledgeAlert = (alertId: string) => {
        toast.success(`Alert ${alertId} acknowledged`);
    };

    // ─── Render ─────────────────────────────────────────────────────

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
                                    Reconciliation Center
                                </h1>
                            </div>
                            <p className="text-sm text-slate-500 font-medium">
                                Verify USDC swept ≈ Total Fiat Payouts + Fees · Detect discrepancies and alerts
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowRunModal(true)}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-[0.97]"
                            >
                                <Play className="w-4 h-4" />
                                Run Reconciliation
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mt-4 flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                        {[
                            { key: "overview" as const, label: "Overview", icon: BarChart3 },
                            { key: "alerts" as const, label: `Alerts ${unresolvedAlerts.length > 0 ? `(${unresolvedAlerts.length})` : ""}`, icon: Bell },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.key
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {activeTab === "overview" && (
                    <>
                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                            {[
                                {
                                    label: "Total USDC Swept",
                                    value: `$${stats.totalSwept.toLocaleString(undefined, { minimumFractionDigits: 0 })}`,
                                    icon: DollarSign,
                                    color: "text-emerald-600",
                                    bg: "bg-emerald-50",
                                    trend: "+8.2%",
                                    trendUp: true,
                                },
                                {
                                    label: "Matched Records",
                                    value: stats.matchedCount.toString(),
                                    icon: CheckCircle,
                                    color: "text-blue-600",
                                    bg: "bg-blue-50",
                                    sub: `of ${stats.totalRecords} total`,
                                },
                                {
                                    label: "Active Discrepancies",
                                    value: stats.discrepancyCount.toString(),
                                    icon: AlertTriangle,
                                    color: "text-rose-600",
                                    bg: "bg-rose-50",
                                    sub: stats.discrepancyCount > 0 ? "Needs attention" : "All clear",
                                },
                                {
                                    label: "Avg Discrepancy",
                                    value: `${stats.avgDiscrepancy.toFixed(2)}%`,
                                    icon: Percent,
                                    color: stats.avgDiscrepancy > 1 ? "text-amber-600" : "text-emerald-600",
                                    bg: stats.avgDiscrepancy > 1 ? "bg-amber-50" : "bg-emerald-50",
                                    sub: stats.avgDiscrepancy <= 1 ? "Within threshold" : "Above 1% threshold",
                                },
                            ].map((stat, i) => (
                                <div
                                    key={i}
                                    className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-slate-500 mb-1">
                                                {stat.label}
                                            </p>
                                            <p className="text-2xl font-extrabold text-slate-900">
                                                {stat.value}
                                            </p>
                                            {stat.trend && (
                                                <p className="text-xs font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                                                    <ArrowUpRight className="w-3 h-3" />
                                                    {stat.trend} this week
                                                </p>
                                            )}
                                            {stat.sub && (
                                                <p className="text-xs font-medium text-slate-400 mt-1.5">
                                                    {stat.sub}
                                                </p>
                                            )}
                                        </div>
                                        <div className={`p-3 rounded-xl ${stat.bg} group-hover:scale-110 transition-transform`}>
                                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Reconciliation Balance Overview Card */}
                        <div className="mb-8 relative overflow-hidden rounded-3xl">
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
                            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500 rounded-full blur-[120px] opacity-15 -translate-y-1/2 translate-x-1/3" />
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500 rounded-full blur-[100px] opacity-10 translate-y-1/2 -translate-x-1/4" />

                            <div className="relative p-8 text-white">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
                                        <Scale className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-lg font-bold tracking-tight">
                                        Reconciliation Balance Overview
                                    </h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 opacity-70">
                                            Total USDC Swept (Crypto In)
                                        </p>
                                        <h3 className="text-3xl font-black">
                                            ${stats.totalSwept.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                            <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                                            {records.reduce((sum, r) => sum + r.payments_count, 0)} payments processed
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-center">
                                        <div className="flex items-center gap-4">
                                            <div className="h-px w-8 bg-white/20" />
                                            <div className="p-3 rounded-full border-2 border-white/20 bg-white/5">
                                                <Activity className="w-6 h-6 text-indigo-300" />
                                            </div>
                                            <div className="h-px w-8 bg-white/20" />
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 opacity-70">
                                            Total Fiat Payouts + Fees (Fiat Out)
                                        </p>
                                        <h3 className="text-3xl font-black">
                                            ${records.reduce((sum, r) => sum + r.total_fiat_payouts + r.total_fees, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                            <ArrowDownRight className="w-3 h-3 text-rose-400" />
                                            {records.reduce((sum, r) => sum + r.settlements_count, 0)} settlements processed
                                        </p>
                                    </div>
                                </div>

                                {/* Balance bar */}
                                <div className="mt-8 bg-white/5 rounded-2xl p-4 border border-white/10">
                                    <div className="flex justify-between text-xs font-bold mb-2">
                                        <span className="text-slate-400">Balance Match Progress</span>
                                        <span className="text-emerald-400">
                                            {((stats.matchedCount / Math.max(stats.totalRecords, 1)) * 100).toFixed(0)}% matched
                                        </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300 transition-all duration-1000"
                                            style={{ width: `${(stats.matchedCount / Math.max(stats.totalRecords, 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6 flex flex-col sm:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5" />
                                <input
                                    type="text"
                                    placeholder="Search reconciliation records..."
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
                                        <option value="matched">Matched</option>
                                        <option value="discrepancy">Discrepancy</option>
                                        <option value="reviewed">Reviewed</option>
                                        <option value="resolved">Resolved</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Reconciliation Records Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-200">
                                            <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                Record ID
                                            </th>
                                            <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                Period
                                            </th>
                                            <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                USDC Swept
                                            </th>
                                            <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                Fiat Out + Fees
                                            </th>
                                            <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                Discrepancy
                                            </th>
                                            <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                Alerts
                                            </th>
                                            <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredRecords.map((r) => {
                                            const config = getStatusConfig(r.status);
                                            const hasAlerts = r.alerts.filter((a) => !a.acknowledged).length > 0;
                                            return (
                                                <tr
                                                    key={r.id}
                                                    className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                                                    onClick={() => setSelectedRecord(r)}
                                                >
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm font-bold text-slate-900">{r.id}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-semibold text-slate-900">
                                                                {new Date(r.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(r.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                {r.payments_count} payments · {r.settlements_count} settlements
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm font-extrabold text-slate-900">
                                                            ${r.total_usdc_swept.toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm font-extrabold text-slate-900">
                                                            ${(r.total_fiat_payouts + r.total_fees).toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className={`text-sm font-bold ${r.discrepancy_percent > 1 ? "text-rose-600" : "text-emerald-600"}`}>
                                                                {r.discrepancy_percent > 1 ? "↑" : "✓"} {r.discrepancy_percent.toFixed(2)}%
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                ${r.discrepancy.toLocaleString()} USDC
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
                                                        {hasAlerts ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                                <Bell className="w-3 h-3" />
                                                                {r.alerts.filter((a) => !a.acknowledged).length}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300 text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedRecord(r);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-200 hover:shadow-sm"
                                                        >
                                                            <Eye className="w-4.5 h-4.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {filteredRecords.length === 0 && (
                                <div className="py-20 text-center">
                                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-50 text-slate-300 mb-4">
                                        <SearchX className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900">No records found</h3>
                                    <p className="text-sm text-slate-500 max-w-xs mx-auto mt-1 font-medium">
                                        No reconciliation records match your filters.
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Alerts Tab */}
                {activeTab === "alerts" && (
                    <div className="space-y-6">
                        {/* Alert Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                            {[
                                {
                                    label: "Unresolved Alerts",
                                    value: unresolvedAlerts.length,
                                    icon: Bell,
                                    color: unresolvedAlerts.length > 0 ? "text-rose-600" : "text-emerald-600",
                                    bg: unresolvedAlerts.length > 0 ? "bg-rose-50" : "bg-emerald-50",
                                },
                                {
                                    label: "Critical/High",
                                    value: unresolvedAlerts.filter((a) => a.severity === "critical" || a.severity === "high").length,
                                    icon: Zap,
                                    color: "text-orange-600",
                                    bg: "bg-orange-50",
                                },
                                {
                                    label: "Total Acknowledged",
                                    value: allAlerts.filter((a) => a.acknowledged).length,
                                    icon: BellOff,
                                    color: "text-slate-600",
                                    bg: "bg-slate-50",
                                },
                            ].map((stat, i) => (
                                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5">
                                    <div className={`p-3 rounded-xl ${stat.bg}`}>
                                        <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 mb-0.5">{stat.label}</p>
                                        <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Alert list */}
                        <div className="space-y-3">
                            {allAlerts.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
                                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 text-emerald-400 mb-4">
                                        <Shield className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 mb-1">All clear!</h3>
                                    <p className="text-sm text-slate-500 font-medium">
                                        No reconciliation alerts at this time.
                                    </p>
                                </div>
                            ) : (
                                allAlerts.map((alert) => {
                                    const sevConfig = getSeverityConfig(alert.severity);
                                    return (
                                        <div
                                            key={alert.id}
                                            className={`bg-white rounded-2xl border shadow-sm p-5 flex items-start gap-4 transition-all hover:shadow-md ${alert.acknowledged ? "border-slate-100 opacity-60" : "border-slate-200"
                                                }`}
                                        >
                                            <div className={`p-2.5 rounded-xl ${sevConfig.bg} border ${sevConfig.border} flex-shrink-0`}>
                                                <AlertTriangle className={`w-5 h-5 ${sevConfig.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sevConfig.bg} ${sevConfig.color} border ${sevConfig.border}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${sevConfig.dot}`} />
                                                        {alert.severity.toUpperCase()}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        {alert.alert_type.replace(/_/g, " ")}
                                                    </span>
                                                    <span className="text-[10px] text-slate-300">•</span>
                                                    <span className="text-[10px] text-slate-400">
                                                        {("reconciliationId" in alert) && (alert as unknown as { reconciliationId: string }).reconciliationId}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-semibold text-slate-900 mb-1">{alert.message}</p>
                                                <p className="text-xs text-slate-400 font-medium">
                                                    {new Date(alert.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                            {!alert.acknowledged ? (
                                                <button
                                                    onClick={() => handleAcknowledgeAlert(alert.id)}
                                                    className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all flex-shrink-0"
                                                >
                                                    Acknowledge
                                                </button>
                                            ) : (
                                                <span className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-lg flex-shrink-0 flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" />
                                                    Done
                                                </span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Details Modal ─────────────────────────────────────────── */}
            {selectedRecord && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 border border-white/20">
                        {/* Modal Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white relative overflow-hidden">
                            <div className="flex items-center gap-4 relative z-10">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg
                                    ${selectedRecord.status === "discrepancy"
                                        ? "bg-rose-500 shadow-rose-200"
                                        : selectedRecord.status === "matched"
                                            ? "bg-emerald-500 shadow-emerald-200"
                                            : "bg-slate-900 shadow-slate-200"
                                    }`}
                                >
                                    <Scale className="w-7 h-7 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-extrabold text-slate-900">
                                        Reconciliation Details
                                    </h2>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                            {selectedRecord.id}
                                        </span>
                                        <ChevronRight className="w-3 h-3 text-slate-300" />
                                        {(() => {
                                            const cfg = getStatusConfig(selectedRecord.status);
                                            return (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                                    {cfg.icon}
                                                    {cfg.label}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedRecord(null)}
                                className="p-3 hover:bg-slate-50 rounded-2xl transition-all relative z-10 border border-slate-100"
                            >
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <div className="space-y-8">
                                {/* Period & Counts */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {[
                                        {
                                            label: "Period",
                                            value: `${new Date(selectedRecord.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(selectedRecord.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
                                            icon: Calendar,
                                        },
                                        { label: "Payments", value: selectedRecord.payments_count.toString(), icon: Hash },
                                        { label: "Settlements", value: selectedRecord.settlements_count.toString(), icon: FileText },
                                        { label: "Created", value: new Date(selectedRecord.created_at).toLocaleDateString(), icon: Clock },
                                    ].map((item, i) => (
                                        <div key={i} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <item.icon className="w-3 h-3 text-slate-400" />
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</p>
                                            </div>
                                            <p className="text-sm font-bold text-slate-900">{item.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Balance Comparison */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                        Balance Comparison
                                        <div className="h-px flex-1 bg-slate-100" />
                                    </h3>
                                    <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-4">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                                                <span className="text-sm font-bold text-slate-500">Total USDC Swept</span>
                                            </div>
                                            <span className="text-sm font-extrabold text-slate-900">
                                                ${selectedRecord.total_usdc_swept.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                                            <div className="flex items-center gap-2">
                                                <ArrowDownRight className="w-4 h-4 text-rose-500" />
                                                <span className="text-sm font-bold text-slate-500">Total Fiat Payouts</span>
                                            </div>
                                            <span className="text-sm font-extrabold text-slate-900">
                                                ${selectedRecord.total_fiat_payouts.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="w-4 h-4 text-amber-500" />
                                                <span className="text-sm font-bold text-slate-500">Total Fees</span>
                                            </div>
                                            <span className="text-sm font-extrabold text-slate-900">
                                                ${selectedRecord.total_fees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        <div className="border-t-2 border-dashed border-slate-200 pt-4 mt-2">
                                            <div className="flex justify-between items-center mb-3">
                                                <span className="text-sm font-bold text-slate-500">Expected Balance</span>
                                                <span className="text-sm font-extrabold text-slate-900">
                                                    ${selectedRecord.expected_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center mb-3">
                                                <span className="text-sm font-bold text-slate-500">Actual Balance</span>
                                                <span className="text-sm font-extrabold text-slate-900">
                                                    ${selectedRecord.actual_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div className={`flex justify-between items-center p-3 rounded-xl ${selectedRecord.discrepancy_percent > 1 ? "bg-rose-50 border border-rose-200" : "bg-emerald-50 border border-emerald-200"
                                                }`}>
                                                <span className={`text-sm font-black ${selectedRecord.discrepancy_percent > 1 ? "text-rose-700" : "text-emerald-700"}`}>
                                                    Discrepancy
                                                </span>
                                                <div className="text-right">
                                                    <span className={`text-sm font-black ${selectedRecord.discrepancy_percent > 1 ? "text-rose-700" : "text-emerald-700"}`}>
                                                        ${selectedRecord.discrepancy.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({selectedRecord.discrepancy_percent.toFixed(2)}%)
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Alerts Section */}
                                {selectedRecord.alerts.length > 0 && (
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                            <Bell className="w-4 h-4 text-rose-500" />
                                            Alerts ({selectedRecord.alerts.length})
                                            <div className="h-px flex-1 bg-slate-100" />
                                        </h3>
                                        <div className="space-y-2">
                                            {selectedRecord.alerts.map((alert) => {
                                                const sevConfig = getSeverityConfig(alert.severity);
                                                return (
                                                    <div key={alert.id} className={`p-4 rounded-2xl border ${alert.acknowledged ? "bg-slate-50 border-slate-100" : `${sevConfig.bg} ${sevConfig.border}`}`}>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${sevConfig.bg} ${sevConfig.color}`}>
                                                                        {alert.severity.toUpperCase()}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                                        {alert.alert_type.replace(/_/g, " ")}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm font-semibold text-slate-900">{alert.message}</p>
                                                            </div>
                                                            {alert.acknowledged ? (
                                                                <span className="text-emerald-500">
                                                                    <CheckCircle className="w-5 h-5" />
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleAcknowledgeAlert(alert.id)}
                                                                    className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                                                                >
                                                                    Acknowledge
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Notes */}
                                {selectedRecord.notes && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                            <Info className="w-4 h-4 text-blue-500" />
                                            Review Notes
                                            <div className="h-px flex-1 bg-slate-100" />
                                        </h3>
                                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                                            <p className="text-sm text-blue-900 font-medium">{selectedRecord.notes}</p>
                                            {selectedRecord.reviewed_by && (
                                                <p className="text-xs text-blue-600 mt-2 font-medium">
                                                    — Reviewed by {selectedRecord.reviewed_by} on {selectedRecord.reviewed_at ? new Date(selectedRecord.reviewed_at).toLocaleString() : ""}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-3">
                            {selectedRecord.status === "pending" || selectedRecord.status === "discrepancy" ? (
                                <>
                                    <button
                                        onClick={() => {
                                            toast.success(`Reconciliation ${selectedRecord.id} marked as reviewed`);
                                            setSelectedRecord(null);
                                        }}
                                        className="w-full sm:flex-1 py-4 bg-slate-900 text-white rounded-2xl text-sm font-black hover:opacity-90 transition-all shadow-lg shadow-slate-200 transform active:scale-[0.98]"
                                    >
                                        Mark as Reviewed
                                    </button>
                                    <button
                                        onClick={() => setSelectedRecord(null)}
                                        className="w-full sm:w-auto px-6 py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl text-sm font-black hover:bg-slate-50 transition-all"
                                    >
                                        Close
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setSelectedRecord(null)}
                                    className="w-full py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl text-sm font-black hover:bg-slate-50 transition-all"
                                >
                                    Close Details
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Run Reconciliation Modal ──────────────────────────────── */}
            {showRunModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-white/20">
                        <div className="px-8 py-6 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-200">
                                    <Play className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-extrabold text-slate-900">Run Reconciliation</h2>
                                    <p className="text-xs text-slate-500 font-medium">Select the period to reconcile</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 space-y-5">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                                    Period Start
                                </label>
                                <input
                                    type="date"
                                    value={periodStart}
                                    onChange={(e) => setPeriodStart(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                                    Period End
                                </label>
                                <input
                                    type="date"
                                    value={periodEnd}
                                    onChange={(e) => setPeriodEnd(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                />
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <div className="flex items-start gap-2">
                                    <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-amber-800 font-medium">
                                        This will compare total USDC swept against total fiat payouts + fees for the selected period. Alerts will be generated for discrepancies above 1%.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 pt-0 flex gap-3">
                            <button
                                onClick={handleRunReconciliation}
                                className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.97] flex items-center justify-center gap-2"
                            >
                                <Zap className="w-4 h-4" />
                                Run Reconciliation
                            </button>
                            <button
                                onClick={() => {
                                    setShowRunModal(false);
                                    setPeriodStart("");
                                    setPeriodEnd("");
                                }}
                                className="px-6 py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl text-sm font-black hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
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

export default AdminReconciliationPage;
