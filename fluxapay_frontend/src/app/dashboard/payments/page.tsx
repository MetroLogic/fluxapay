"use client";

import { useState, useMemo } from "react";
import { MOCK_PAYMENTS, Payment } from "@/features/dashboard/payments/payments-mock";
import { PaymentsTable } from "@/features/dashboard/payments/PaymentsTable";
import { PaymentsFilters } from "@/features/dashboard/payments/PaymentsFilters";
import { PaymentDetails } from "@/features/dashboard/payments/PaymentDetails";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Download, Plus } from "lucide-react";

export default function PaymentsPage() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [currencyFilter, setCurrencyFilter] = useState("all");
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

    const filteredPayments = useMemo(() => {
        return MOCK_PAYMENTS.filter((payment) => {
            const matchesSearch =
                payment.id.toLowerCase().includes(search.toLowerCase()) ||
                payment.orderId.toLowerCase().includes(search.toLowerCase()) ||
                payment.customerEmail.toLowerCase().includes(search.toLowerCase()) ||
                payment.customerName.toLowerCase().includes(search.toLowerCase());

            const matchesStatus = statusFilter === "all" || payment.status === statusFilter;
            const matchesCurrency = currencyFilter === "all" || payment.currency === currencyFilter;

            return matchesSearch && matchesStatus && matchesCurrency;
        });
    }, [search, statusFilter, currencyFilter]);

    const handleExportCSV = () => {
        const headers = ["ID", "Amount", "Currency", "Status", "Customer", "Email", "OrderID", "Date"];
        const rows = filteredPayments.map(p => [
            p.id, p.amount, p.currency, p.status, p.customerName, p.customerEmail, p.orderId, p.createdAt
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `payments_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Payments History</h2>
                    <p className="text-muted-foreground">
                        View and manage all transactions processed through Fluxapay.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" className="gap-2" onClick={handleExportCSV}>
                        <Download className="h-4 w-4" />
                        Export CSV
                    </Button>
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Payment
                    </Button>
                </div>
            </div>

            <div className="bg-card rounded-2xl border p-6 shadow-sm">
                <PaymentsFilters
                    onSearchChange={setSearch}
                    onStatusChange={setStatusFilter}
                    onCurrencyChange={setCurrencyFilter}
                />

                <PaymentsTable
                    payments={filteredPayments}
                    onRowClick={(payment) => setSelectedPayment(payment)}
                />

                <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
                    <p>Showing {filteredPayments.length} of {MOCK_PAYMENTS.length} payments</p>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" disabled>Previous</Button>
                        <Button variant="secondary" size="sm" disabled>Next</Button>
                    </div>
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
