"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Activity,
  Database,
  Percent,
  CalendarClock,
} from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SweepStatus {
  status: string;
  unsettled_payment_count: number;
  pending_settlement_count: number;
  exchange_partner: string;
  settlement_fee_percent: number;
  cron_schedule: string;
  recent_batches: RecentBatch[];
}

interface RecentBatch {
  id: string;
  merchantId: string;
  currency: string;
  usdc_amount: string | number;
  net_amount: string | number;
  status: string;
  processed_date: string | null;
  created_at: string;
}

interface MerchantResult {
  merchantId: string;
  businessName: string;
  status: "succeeded" | "failed" | "skipped";
  settlementId?: string;
  usdcAmount?: number;
  fiatCurrency?: string;
  fiatGross?: number;
  feeAmount?: number;
  netAmount?: number;
  exchangeRate?: number;
  exchangeRef?: string;
  transferRef?: string;
  paymentCount?: number;
  error?: string;
}

interface SweepResult {
  message: string;
  batchId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalMerchantsProcessed: number;
  totalMerchantsSucceeded: number;
  totalMerchantsFailed: number;
  merchantResults: MerchantResult[];
}

interface LogEntry {
  time: string;
  level: "info" | "success" | "error" | "warn";
  message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    succeeded: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      label: "Succeeded",
    },
    completed: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      label: "Completed",
    },
    failed: { bg: "bg-rose-50", text: "text-rose-700", label: "Failed" },
    skipped: { bg: "bg-amber-50", text: "text-amber-700", label: "Skipped" },
    pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pending" },
    processing: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      label: "Processing",
    },
    ok: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Online" },
  };
  const cfg = map[status.toLowerCase()] ?? {
    bg: "bg-slate-50",
    text: "text-slate-700",
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SweepPage() {
  const [sweepStatus, setSweepStatus] = useState<SweepStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepResult, setSweepResult] = useState<SweepResult | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);

  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const entry: LogEntry = {
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      level,
      message,
    };
    setLogs((prev) => [...prev, entry]);
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await api.sweep.getStatus();
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ message: "Unknown error" }));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const data: SweepStatus = await res.json();
      setSweepStatus(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    addLog("info", "Sweep Control Center loaded.");
    fetchStatus();
  }, [fetchStatus, addLog]);

  const handleTriggerSweep = async () => {
    setSweepRunning(true);
    setSweepResult(null);
    setSweepError(null);
    addLog("info", "▶ Triggering accounts sweep...");

    try {
      const res = await api.sweep.runSweep();
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }

      const result = data as SweepResult;
      setSweepResult(result);

      addLog(
        "info",
        `Batch ${result.batchId} started at ${fmtDate(result.startedAt)}`,
      );
      addLog("info", `${result.totalMerchantsProcessed} merchant(s) in scope`);

      result.merchantResults.forEach((m) => {
        if (m.status === "succeeded") {
          addLog(
            "success",
            `✅ ${m.businessName}: ${m.usdcAmount} USDC → ${m.netAmount} ${m.fiatCurrency} (${m.paymentCount} payments)`,
          );
        } else if (m.status === "failed") {
          addLog("error", `❌ ${m.businessName}: ${m.error}`);
        } else {
          addLog("warn", `⏩ ${m.businessName}: skipped — ${m.error}`);
        }
      });

      addLog(
        "success",
        `🏁 Batch complete in ${result.durationMs}ms — ${result.totalMerchantsSucceeded} succeeded, ${result.totalMerchantsFailed} failed`,
      );

      // Refresh status after a sweep
      await fetchStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSweepError(msg);
      addLog("error", `Sweep failed: ${msg}`);
    } finally {
      setSweepRunning(false);
    }
  };

  const logColors: Record<LogEntry["level"], string> = {
    info: "text-slate-400",
    success: "text-emerald-400",
    error: "text-rose-400",
    warn: "text-amber-400",
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white uppercase tracking-wider">
              Admin
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Sweep Control Center
            </h1>
          </div>
          <p className="text-sm text-slate-500">
            Monitor and manually trigger accounts sweep batches
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            disabled={statusLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${statusLoading ? "animate-spin" : ""}`}
            />
            Refresh Status
          </button>

          <button
            onClick={handleTriggerSweep}
            disabled={sweepRunning}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-slate-900 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-slate-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {sweepRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Running sweep…
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Trigger Accounts Sweep
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── System Status Cards ── */}
      <section>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
          System Status
        </h2>

        {statusError && (
          <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-medium mb-4">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Could not reach backend: {statusError}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Unsettled Payments",
              value: statusLoading
                ? "…"
                : (sweepStatus?.unsettled_payment_count ?? "—"),
              icon: Database,
              highlight: sweepStatus && sweepStatus.unsettled_payment_count > 0,
              highlightClass: "text-amber-600",
            },
            {
              label: "Pending Settlements",
              value: statusLoading
                ? "…"
                : (sweepStatus?.pending_settlement_count ?? "—"),
              icon: Clock,
              highlight: false,
            },
            {
              label: "Platform Fee",
              value: statusLoading
                ? "…"
                : sweepStatus
                  ? `${sweepStatus.settlement_fee_percent}%`
                  : "—",
              icon: Percent,
              highlight: false,
            },
            {
              label: "Cron Schedule",
              value: statusLoading ? "…" : (sweepStatus?.cron_schedule ?? "—"),
              icon: CalendarClock,
              highlight: false,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm"
            >
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <stat.icon
                  className={`w-5 h-5 ${stat.highlight ? stat.highlightClass : "text-slate-500"}`}
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
                  {stat.label}
                </p>
                <p
                  className={`text-lg font-black ${stat.highlight ? stat.highlightClass : "text-slate-900"}`}
                >
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── System Health + Exchange ── */}
      {sweepStatus && (
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <span className="text-slate-500 font-medium">System:</span>
          <StatusPill status={sweepStatus.status} />
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-medium">Exchange partner:</span>
          <span className="font-semibold text-slate-900 capitalize">
            {sweepStatus.exchange_partner}
          </span>
        </div>
      )}

      {/* ── Sweep Result Panel ── */}
      {(sweepRunning || sweepResult || sweepError) && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <Activity className="w-5 h-5 text-slate-500" />
            <h2 className="font-bold text-slate-900">Latest Sweep Result</h2>
            {sweepResult && (
              <span className="ml-auto text-xs font-mono text-slate-400">
                {sweepResult.batchId}
              </span>
            )}
          </div>

          {sweepRunning && (
            <div className="p-10 flex flex-col items-center gap-4 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
              <p className="text-sm font-medium">
                Sweep in progress — this may take a moment…
              </p>
            </div>
          )}

          {sweepError && !sweepRunning && (
            <div className="p-6 flex items-center gap-3 text-rose-700 text-sm font-medium">
              <XCircle className="w-5 h-5 flex-shrink-0" />
              {sweepError}
            </div>
          )}

          {sweepResult && !sweepRunning && (
            <div className="p-6 space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: "Processed",
                    value: sweepResult.totalMerchantsProcessed,
                    color: "text-slate-900",
                  },
                  {
                    label: "Succeeded",
                    value: sweepResult.totalMerchantsSucceeded,
                    color: "text-emerald-600",
                  },
                  {
                    label: "Failed",
                    value: sweepResult.totalMerchantsFailed,
                    color: "text-rose-600",
                  },
                  {
                    label: "Duration",
                    value: `${sweepResult.durationMs}ms`,
                    color: "text-blue-600",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-slate-50 rounded-xl p-4 border border-slate-100"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 mb-1">
                      {kpi.label}
                    </p>
                    <p className={`text-2xl font-black ${kpi.color}`}>
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Duration row */}
              <div className="flex gap-6 text-xs text-slate-500 font-medium">
                <span>
                  Started:{" "}
                  <span className="text-slate-700 font-semibold">
                    {fmtDate(sweepResult.startedAt)}
                  </span>
                </span>
                <span>
                  Completed:{" "}
                  <span className="text-slate-700 font-semibold">
                    {fmtDate(sweepResult.completedAt)}
                  </span>
                </span>
              </div>

              {/* Per-merchant table */}
              {sweepResult.merchantResults.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                    Merchant Results
                  </h3>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Merchant
                          </th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            USDC
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Net Fiat
                          </th>
                          <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Payments
                          </th>
                          <th className="px-4 py-3 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sweepResult.merchantResults.map((m) => (
                          <>
                            <tr
                              key={m.merchantId}
                              className="hover:bg-slate-50 transition-colors cursor-pointer"
                              onClick={() =>
                                setExpandedMerchant(
                                  expandedMerchant === m.merchantId
                                    ? null
                                    : m.merchantId,
                                )
                              }
                            >
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900">
                                  {m.businessName}
                                </p>
                                <p className="text-[11px] text-slate-400 font-mono">
                                  {m.merchantId}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <StatusPill status={m.status} />
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-700">
                                {m.usdcAmount ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                {m.netAmount != null
                                  ? `${m.fiatCurrency} ${m.netAmount}`
                                  : (m.error ?? "—")}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600">
                                {m.paymentCount ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {expandedMerchant === m.merchantId ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </td>
                            </tr>

                            {expandedMerchant === m.merchantId && (
                              <tr
                                key={`${m.merchantId}-detail`}
                                className="bg-slate-50/80"
                              >
                                <td colSpan={6} className="px-6 py-4">
                                  {m.status === "succeeded" ? (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                      {[
                                        {
                                          label: "Settlement ID",
                                          value: m.settlementId,
                                        },
                                        {
                                          label: "Exchange Rate",
                                          value: m.exchangeRate,
                                        },
                                        {
                                          label: "Gross Fiat",
                                          value: `${m.fiatCurrency} ${m.fiatGross}`,
                                        },
                                        {
                                          label: "Fee",
                                          value: `${m.fiatCurrency} ${m.feeAmount}`,
                                        },
                                        {
                                          label: "Exchange Ref",
                                          value: m.exchangeRef,
                                        },
                                        {
                                          label: "Transfer Ref",
                                          value: m.transferRef,
                                        },
                                      ].map((row) => (
                                        <div key={row.label}>
                                          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">
                                            {row.label}
                                          </p>
                                          <p className="font-mono text-slate-700 text-xs break-all">
                                            {row.value ?? "—"}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 text-sm text-rose-700">
                                      <XCircle className="w-4 h-4 flex-shrink-0" />
                                      {m.error ?? "Unknown error"}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {sweepResult.totalMerchantsProcessed === 0 && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm font-medium">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  No unsettled payments found — nothing to sweep.
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Recent Batches ── */}
      {sweepStatus && sweepStatus.recent_batches.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">
              Recent Settlement Batches
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Last 5 settlement records
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Merchant
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    USDC In
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Net Out
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Processed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sweepStatus.recent_batches.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-slate-500 truncate max-w-[120px]">
                      {b.id}
                    </td>
                    <td className="px-5 py-3 text-slate-700 font-medium text-xs font-mono">
                      {b.merchantId}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-700">
                      {Number(b.usdc_amount).toFixed(4)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">
                      {b.currency} {Number(b.net_amount).toFixed(2)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={b.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {fmtDate(b.processed_date ?? b.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Activity Log ── */}
      <section className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Activity Log
          </h2>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="ml-auto text-[10px] font-medium text-slate-600 hover:text-slate-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div
          ref={logRef}
          className="p-4 h-52 overflow-y-auto font-mono text-xs space-y-1 scroll-smooth"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#334155 transparent",
          }}
        >
          {logs.length === 0 && (
            <span className="text-slate-700">
              No log entries yet. Trigger a sweep to see activity.
            </span>
          )}
          {logs.map((entry, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-slate-600 flex-shrink-0">{entry.time}</span>
              <span className={logColors[entry.level]}>{entry.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
