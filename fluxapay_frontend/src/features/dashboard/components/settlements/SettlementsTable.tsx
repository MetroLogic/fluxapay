'use client';

import { FileText } from 'lucide-react';
import { DataTableBodyState } from '@/components/data-table';
import type { MerchantSettlement } from '@/hooks/useSettlements';
import { Badge } from '@/components/Badge';

type Props = {
    settlements: MerchantSettlement[];
    onSelect: (settlement: MerchantSettlement) => void;
    isLoading?: boolean;
    error?: string | null;
};

export function SettlementsTable({ settlements, onSelect, isLoading = false, error = null }: Props) {
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
        <div className="bg-card shadow overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Settlement ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Payments
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                USDC Amount
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Fiat Amount
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Currency
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Bank Ref
                            </th>
                        </tr>
                    </thead>

                    <tbody className="divide-y">
                        <DataTableBodyState
                            colSpan={8}
                            state={
                                error
                                    ? 'error'
                                    : isLoading
                                        ? 'loading'
                                        : settlements.length === 0
                                            ? 'empty'
                                            : 'ready'
                            }
                            errorMessage={error ?? undefined}
                            emptyMessage="No settlements found matching your filters."
                        >
                            {settlements.map((settlement) => (
                                <tr
                                    key={settlement.id}
                                    onClick={() => onSelect(settlement)}
                                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-muted-foreground" />
                                            <span className="font-mono text-sm">{settlement.id.slice(0, 12)}…</span>
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {settlement.date
                                            ? new Date(settlement.date).toLocaleDateString()
                                            : '—'}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {settlement.paymentsCount}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium font-mono">
                                        ${settlement.usdcAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium font-mono">
                                        ${settlement.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {settlement.currency}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {getStatusBadge(settlement.status)}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-mono">
                                        {settlement.bankReference || '—'}
                                    </td>
                                </tr>
                            ))}
                        </DataTableBodyState>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
