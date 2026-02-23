'use client';

import { FileText } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { Settlement } from '../types';

type Props = {
    settlements: Settlement[];
    onSelect: (settlement: Settlement) => void;
};

export function SettlementsTable({ settlements, onSelect }: Props) {
    return (
        <div className="rounded-xl border bg-card shadow overflow-hidden">
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
                        {settlements.length === 0 ? (
                            <EmptyState
                                colSpan={8}
                                className="py-12 text-muted-foreground"
                                message="No settlements found matching your filters."
                            />
                        ) : (
                            settlements.map((settlement) => (
                                <tr
                                    key={settlement.id}
                                    onClick={() => onSelect(settlement)}
                                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-muted-foreground" />
                                            <span className="font-medium">{settlement.id}</span>
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {new Date(settlement.date).toLocaleDateString()}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {settlement.paymentsCount}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        ${settlement.usdcAmount.toLocaleString()}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        ${settlement.fiatAmount.toLocaleString()}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {settlement.currency}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${settlement.status === 'completed'
                                                ? 'bg-green-100 text-green-800'
                                                : settlement.status === 'pending'
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : 'bg-red-100 text-red-800'
                                                }`}
                                        >
                                            {settlement.status}
                                        </span>
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                                        {settlement.bankReference}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
