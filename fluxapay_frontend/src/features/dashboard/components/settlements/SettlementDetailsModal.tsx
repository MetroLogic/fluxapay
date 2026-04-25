'use client';

import { X, Download, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/Badge';
import {
    useSettlementDetails,
    useSettlementExport,
} from '@/hooks/useSettlements';

type Props = {
    settlementId: string;
    onClose: () => void;
};

export function SettlementDetailsModal({ settlementId, onClose }: Props) {
    const { detail, isLoading, error } = useSettlementDetails(settlementId);
    const { download, exporting } = useSettlementExport();

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed': return <Badge variant="success">Completed</Badge>;
            case 'pending': return <Badge variant="warning">Pending</Badge>;
            case 'processing': return <Badge variant="info">Processing</Badge>;
            case 'failed': return <Badge variant="error">Failed</Badge>;
            default: return <Badge>{status}</Badge>;
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-border sticky top-0 bg-card rounded-t-2xl flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold">Settlement Details</h3>
                        <p className="text-sm text-muted-foreground font-mono mt-0.5">
                            {settlementId}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-secondary rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Close dialog"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {isLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">Loading settlement…</span>
                        </div>
                    )}

                    {error && !isLoading && (
                        <div className="text-center py-12 text-red-500">
                            Failed to load settlement details.
                        </div>
                    )}

                    {detail && !isLoading && (
                        <>
                            {/* Summary grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <Info
                                    label="Date"
                                    value={new Date(detail.created_at).toLocaleDateString()}
                                />
                                <Info label="Status" value={getStatusBadge(detail.status)} />
                                <Info
                                    label="Scheduled"
                                    value={new Date(detail.scheduled_date).toLocaleDateString()}
                                />
                                <Info
                                    label="Processed"
                                    value={
                                        detail.processed_date
                                            ? new Date(detail.processed_date).toLocaleDateString()
                                            : '—'
                                    }
                                />
                                <Info label="Currency" value={detail.currency} />
                                <Info
                                    label="Bank Transfer"
                                    value={detail.bank_transfer_id ?? '—'}
                                />
                            </div>

                            {/* Financial breakdown */}
                            <div className="border border-border rounded-xl p-4 space-y-2">
                                <Row
                                    label="USDC Amount"
                                    value={`$${Number(detail.usdc_amount ?? detail.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                />
                                <Row
                                    label="Exchange Rate"
                                    value={detail.exchange_rate ? String(detail.exchange_rate) : '1.00'}
                                />
                                <Row
                                    label="Fees"
                                    value={`-$${Number(detail.fees).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                    danger
                                />
                                <div className="border-t border-border pt-2" />
                                <Row
                                    label={`Net Payout (${detail.currency})`}
                                    value={`$${Number(detail.net_amount ?? Number(detail.amount) - Number(detail.fees)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                    bold
                                />
                            </div>

                            {/* Download buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => download(settlementId, 'pdf')}
                                    disabled={exporting}
                                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl font-medium transition-colors hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {exporting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Download className="w-4 h-4" />
                                    )}
                                    PDF Report
                                </button>

                                <button
                                    onClick={() => download(settlementId, 'csv')}
                                    disabled={exporting}
                                    className="flex-1 flex items-center justify-center gap-2 border border-border py-2.5 rounded-xl font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                                >
                                    {exporting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <FileText className="w-4 h-4" />
                                    )}
                                    CSV Report
                                </button>
                            </div>

                            {/* Failure reason */}
                            {detail.failure_reason && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-xl p-4">
                                    <strong>Failure reason:</strong> {detail.failure_reason}
                                </div>
                            )}

                            {/* Payments list */}
                            {detail.payments && detail.payments.length > 0 && (
                                <div>
                                    <h4 className="font-semibold mb-3">
                                        Included Payments ({detail.payments.length})
                                    </h4>
                                    <div className="border border-border rounded-xl divide-y divide-border max-h-60 overflow-y-auto">
                                        {detail.payments.map((p) => (
                                            <div key={p.id} className="p-3 flex justify-between items-center">
                                                <div>
                                                    <p className="font-mono text-xs text-muted-foreground">
                                                        {p.id}
                                                    </p>
                                                    <p className="text-sm">{p.customer_email}</p>
                                                </div>
                                                <p className="font-mono font-medium">
                                                    ${Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <div className="font-medium text-sm">{value}</div>
        </div>
    );
}

function Row({
    label,
    value,
    danger,
    bold,
}: {
    label: string;
    value: React.ReactNode;
    danger?: boolean;
    bold?: boolean;
}) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span
                className={[
                    bold && 'font-bold',
                    danger && 'text-red-600',
                ].filter(Boolean).join(' ')}
            >
                {value}
            </span>
        </div>
    );
}
