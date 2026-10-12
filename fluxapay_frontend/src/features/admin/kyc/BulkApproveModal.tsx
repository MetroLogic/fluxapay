"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle, X, Loader2, AlertTriangle } from "lucide-react";

interface FailedItem {
  id: string;
  error?: string;
}

interface BulkApproveModalProps {
  count: number;
  onConfirm: () => Promise<{ succeeded: number; failed: FailedItem[] }>;
  onClose: () => void;
}

export default function BulkApproveModal({ count, onConfirm, onClose }: BulkApproveModalProps) {
  const [confirmInput, setConfirmInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: FailedItem[] } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, loading]);

  const isConfirmed = confirmInput.trim().toUpperCase() === "APPROVE";

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await onConfirm();
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
              <CheckCircle className="w-6 h-6 mt-0.5 shrink-0 text-emerald-600" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">
                  Bulk Approve {count} Application{count !== 1 ? "s" : ""}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  Warning: This action will verify and activate KYC status for all selected merchants. This cannot be undone automatically.
                </p>
              </div>
              <button onClick={onClose} disabled={loading} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="mb-5 space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                To confirm bulk approval of <span className="font-bold text-slate-700">{count} merchants</span>, type <span className="font-mono font-bold text-emerald-700">APPROVE</span> below or click "Yes, I'm sure".
              </p>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                placeholder="Type APPROVE to confirm..."
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || (!isConfirmed && confirmInput !== "YES")}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Processing..." : "Yes, I'm sure"}
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
              <h3 className="text-lg font-semibold text-slate-900">Bulk Approval Complete</h3>
              <p className="text-sm text-slate-600 mt-1">
                <span className="font-medium text-emerald-700">{result.succeeded} approved</span>
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
