'use client';

import { useState, useMemo } from 'react';
import { MOCK_PAYMENTS } from './mock-data';
import { Payment, PaymentFilterState } from './types';
import { PaymentsTable } from './components/PaymentsTable';
import { PaymentFilters } from './components/PaymentFilters';
import { PaymentDetails } from './components/PaymentDetails';
import { Modal } from '@/components/Modal';

export default function PaymentMonitor() {
    const [payments] = useState<Payment[]>(MOCK_PAYMENTS);
    const [filters, setFilters] = useState<PaymentFilterState>({
        status: 'all',
        merchant: '',
    });
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            // Status Filter
            if (filters.status && filters.status !== 'all' && p.status !== filters.status) {
                return false;
            }

            // Merchant/Search Filter
            if (filters.merchant) {
                const searchLower = filters.merchant.toLowerCase();
                const matchesMerchant = p.merchantName.toLowerCase().includes(searchLower) ||
                    p.id.toLowerCase().includes(searchLower) ||
                    p.merchantId.toLowerCase().includes(searchLower);
                if (!matchesMerchant) return false;
            }

            // Date Range Filter
            if (filters.dateRange?.from) {
                if (new Date(p.createdAt) < filters.dateRange.from) return false;
            }
            if (filters.dateRange?.to) {
                // Add one day to include the end date fully if it's just a date string logic, 
                // usually nice to set time to 23:59:59 but for simple comparison:
                const endDate = new Date(filters.dateRange.to);
                endDate.setHours(23, 59, 59, 999);
                if (new Date(p.createdAt) > endDate) return false;
            }

            return true;
        });
    }, [payments, filters]);

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

                <PaymentsTable
                    payments={filteredPayments}
                    onSelectPayment={setSelectedPayment}
                />

                <div className="text-xs text-muted-foreground text-right">
                    Showing {filteredPayments.length} results
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
