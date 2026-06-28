"use client";

import React, { useState } from "react";
import { AlertTriangle, X, Loader2, CheckCircle } from "lucide-react";

interface FailedItem {
  id: string;
  error?: string;
}

interface BulkRejectModalProps {
  count: number;
  onConfirm: (reason: string, notes: string) => Promise<{ succeeded: number; failed: FailedItem[] }>;
  onClose: () => void;
}

const rejectionReasons = [
  { value: "incomplete_documents", label: "Incomplete Documents" },
  { value: "invalid_information", label: "Invalid Information" },
  { value: "unsupported_country", label: "Unsupported Country" },
  { value: "fraud_risk", label: "Fraud Risk" },
  { value: "compliance_issue", label: "Compliance Issue" },
  { value: "other", label: "Other" },
];

export default function BulkRejectModal({ count, onConfirm, onClose }: BulkRejectModalProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: FailedItem[] } | null>(null);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      const res = await onConfirm(reason, notes.trim());
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
              <AlertTriangle className="w-6 h-6 mt-0.5 shrink-0 text-rose-600" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">
                  Bulk Reject {count} Application{count !== 1 ? "s" : ""}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  This action cannot be undone. Merchants will be notified of the rejection.
                </p>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="mb-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">Select a reason...</option>
                  {rejectionReasons.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Additional Notes (Optional)
                </label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                  rows={3}
                  placeholder="Provide additional context or details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
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
                disabled={loading || !reason.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-rose-600 hover:bg-rose-700 text-white"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Processing..." : "Confirm Rejection"}
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
              <h3 className="text-lg font-semibold text-slate-900">Bulk Rejection Complete</h3>
              <p className="text-sm text-slate-600 mt-1">
                <span className="font-medium text-emerald-700">{result.succeeded} rejected</span>
                {result.failed.length > 0 && (
                  <>, <span className="font-medium text-rose-700">{result.failed.length} failed</span></>
                )}
              </p>
            </div>

            {result.failed.length > 0 && (
              <div className="mb-5 max-h-40 overflow-y-auto border border-rose-200 rounded-lg bg-rose-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-rose-700 mb-2">Failed applications:</p>
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
