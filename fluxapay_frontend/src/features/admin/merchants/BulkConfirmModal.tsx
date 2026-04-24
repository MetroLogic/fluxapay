"use client";

import React, { useState } from "react";
import { AlertTriangle, X, Loader2, CheckCircle } from "lucide-react";

interface FailedItem {
  id: string;
  error?: string;
}

interface BulkConfirmModalProps {
  count: number;
  action: "suspend" | "activate";
  onConfirm: (reason: string) => Promise<{ succeeded: number; failed: FailedItem[] }>;
  onClose: () => void;
}

export default function BulkConfirmModal({ count, action, onConfirm, onClose }: BulkConfirmModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: FailedItem[] } | null>(null);

  const isSuspend = action === "suspend";

  const handleConfirm = async () => {
    if (reason.trim().length < 3) return;
    setLoading(true);
    try {
      const res = await onConfirm(reason.trim());
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        {!result ? (
          <>
            <div className="flex items-start gap-4 mb-5">
              <AlertTriangle className={`w-6 h-6 mt-0.5 shrink-0 ${isSuspend ? "text-rose-600" : "text-emerald-600"}`} />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">
                  Bulk {isSuspend ? "Suspend" : "Activate"} {count} Merchant{count !== 1 ? "s" : ""}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {isSuspend
                    ? "Suspended merchants cannot process payments. This action is reversible."
                    : "This will re-enable payment processing for all selected merchants."}
                </p>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Audit Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                rows={3}
                placeholder="Provide a reason for this bulk action (required for audit log)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {reason.length > 0 && reason.trim().length < 3 && (
                <p className="text-xs text-rose-600 mt-1">Reason must be at least 3 characters.</p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || reason.trim().length < 3}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSuspend
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }`}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Processing..." : `Confirm ${isSuspend ? "Suspend" : "Activate"}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-5">
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-3 ${result.failed.length === 0 ? "bg-emerald-50" : "bg-amber-50"}`}>
                {result.failed.length === 0
                  ? <CheckCircle className="w-7 h-7 text-emerald-600" />
                  : <AlertTriangle className="w-7 h-7 text-amber-600" />}
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Bulk Action Complete</h3>
              <p className="text-sm text-slate-600 mt-1">
                <span className="font-medium text-emerald-700">{result.succeeded} succeeded</span>
                {result.failed.length > 0 && (
                  <>, <span className="font-medium text-rose-700">{result.failed.length} failed</span></>
                )}
              </p>
            </div>

            {result.failed.length > 0 && (
              <div className="mb-5 max-h-40 overflow-y-auto border border-rose-200 rounded-lg bg-rose-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-rose-700 mb-2">Failed merchants:</p>
                {result.failed.map((f) => (
                  <div key={f.id} className="text-xs text-rose-700 font-mono">
                    {f.id} — {f.error ?? "Unknown error"}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
