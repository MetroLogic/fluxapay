'use client';

import { X, Download, FileText } from 'lucide-react';
import { Settlement } from '../types';
import { downloadSettlementPdf } from '@/lib/downloadPdf';
import { downloadSettlementCsv } from '@/lib/downloadCsv';

type Props = {
    settlement: Settlement;
    onClose: () => void;
};

export function SettlementDetailsModal({ settlement, onClose }: Props) {
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 border-b sticky top-0 bg-white flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold">{settlement.id}</h3>
                        <p className="text-sm text-muted-foreground">Settlement details</p>
                    </div>
                    <button onClick={onClose}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-4">
                        <Info label="Date" value={new Date(settlement.date).toLocaleDateString()} />
                        <Info label="Status" value={settlement.status} />
                        <Info label="Payments" value={settlement.paymentsCount} />
                        <Info label="Bank Ref" value={settlement.bankReference} />
                    </div>

                    {/* Financials */}
                    <div className="border rounded-lg p-4 space-y-2">
                        <Row label="USDC Amount" value={`$${settlement.usdcAmount}`} />
                        <Row label="Conversion Rate" value={settlement.conversionRate} />
                        <Row label="Fees" value={`-$${settlement.fees}`} danger />
                        <Row
                            label={`Total (${settlement.currency})`}
                            value={`$${settlement.fiatAmount - settlement.fees}`}
                            bold
                        />
                    </div>

                    {/* Downloads */}
                    <div className="flex gap-3">
                        <button
                            onClick={() => downloadSettlementPdf(settlement)}
                            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2 rounded-lg"
                        >
                            <Download className="w-4 h-4" />
                            PDF
                        </button>

                        <button
                            onClick={() => downloadSettlementCsv(settlement)}
                            className="flex-1 flex items-center justify-center gap-2 border py-2 rounded-lg"
                        >
                            <FileText className="w-4 h-4" />
                            CSV
                        </button>
                    </div>

                    {/* Payments */}
                    {settlement.payments.length > 0 && (
                        <div>
                            <h4 className="font-semibold mb-3">Payments</h4>
                            <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                                {settlement.payments.map((p) => (
                                    <div key={p.id} className="p-3 flex justify-between">
                                        <div>
                                            <p className="font-medium text-sm">{p.id}</p>
                                            <p className="text-xs text-muted-foreground">{p.customer}</p>
                                        </div>
                                        <p className="font-medium">${p.amount.toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
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
                ].join(' ')}
            >
                {value}
            </span>
        </div>
    );
}
