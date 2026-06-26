'use client';

import { useState, useEffect } from 'react';
import { Payment, PaymentFilterState } from './types';
import { PaymentsTable } from './components/PaymentsTable';
import { PaymentFilters } from './components/PaymentFilters';
import { PaymentDetails } from './components/PaymentDetails';
import { Modal } from '@/components/Modal';
import { useAdminPayments } from '@/hooks/useAdminPayments';
import { Button } from '@/components/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PaymentMonitor() {
    const [filters, setFilters] = useState<PaymentFilterState>({
        status: 'all',
        merchant: '',
    });
    const [page, setPage] = useState(1);
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

    // Reset to page 1 on filter changes
    useEffect(() => {
        setPage(1);
    }, [filters]);

    // Format dates for backend API
    const date_from = filters.dateRange?.from ? filters.dateRange.from.toISOString() : undefined;
    const date_to = filters.dateRange?.to ? filters.dateRange.to.toISOString() : undefined;

    const { payments, meta, isLoading, error } = useAdminPayments({
        page,
        limit: 20,
        status: filters.status,
        search: filters.merchant,
        date_from,
        date_to,
    });

    const totalPages = Math.ceil(meta.total / meta.limit) || 1;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight">Payments Monitor</h1>
                <p className="text-muted-foreground">
                    Real-time monitoring of all platform payments and settlement statuses.
                </p>
            </div>

            <div className="space-y-4">
                <PaymentFilters filters={filters} onFilterChange={setFilters} />

                {error && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                        Failed to load live payments. Showing empty results.
                    </div>
                )}

                <PaymentsTable
                    payments={payments}
                    onSelectPayment={setSelectedPayment}
                    isLoading={isLoading}
                />

                <div className="flex items-center justify-between mt-4">
                    <div className="text-xs text-muted-foreground">
                        Showing {meta.total > 0 ? (page - 1) * meta.limit + 1 : 0} to {Math.min(page * meta.limit, meta.total)} of {meta.total} results
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium">
                                Page {page} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                isOpen={!!selectedPayment}
                onClose={() => setSelectedPayment(null)}
                title="Payment Details"
            >
                {selectedPayment && <PaymentDetails payment={selectedPayment} />}
            </Modal>
        </div>
    );
}
