import PaymentMonitor from "@/features/admin/payments/PaymentMonitor";

export const metadata = {
    title: 'Admin Payments Monitor | FluxaPay',
    description: 'Monitor platform payments',
};

export default function AdminPaymentsPage() {
    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl">
            <PaymentMonitor />
        </div>
    );
}
