import { Payment } from '../types';
import { Button } from '@/components/Button';
import { Eye, ArrowRight, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentsTableProps {
    payments: Payment[];
    onSelectPayment: (payment: Payment) => void;
}

export function PaymentsTable({ payments, onSelectPayment }: PaymentsTableProps) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-500/10 text-green-600 border-green-200';
            case 'processing': return 'bg-yellow-500/10 text-yellow-600 border-yellow-200';
            case 'failed': return 'bg-red-500/10 text-red-600 border-red-200';
            case 'settled': return 'bg-blue-500/10 text-blue-600 border-blue-200';
            default: return 'bg-gray-500/10 text-gray-600 border-gray-200';
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Payment ID</th>
                            <th className="px-6 py-4 font-semibold">Merchant</th>
                            <th className="px-6 py-4 font-semibold text-right">Amount</th>
                            <th className="px-6 py-4 font-semibold text-center">Status</th>
                            <th className="px-6 py-4 font-semibold">Date</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {payments.map((payment) => (
                            <tr
                                key={payment.id}
                                className="group hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={() => onSelectPayment(payment)}
                            >
                                <td className="px-6 py-4 font-mono text-xs text-primary font-medium">
                                    {payment.id.slice(0, 12)}...
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-foreground">{payment.merchantName}</span>
                                        <span className="text-xs text-muted-foreground font-mono">{payment.merchantId.slice(0, 8)}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="font-mono font-semibold">
                                        {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        <span className="ml-1 text-xs text-muted-foreground">{payment.currency}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={cn(
                                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                        getStatusColor(payment.status)
                                    )}>
                                        {payment.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                                    {new Date(payment.createdAt).toLocaleDateString()}
                                    <span className="block text-xs opacity-70">
                                        {new Date(payment.createdAt).toLocaleTimeString()}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectPayment(payment);
                                    }}>
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {payments.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                                    No payments found matching your criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
