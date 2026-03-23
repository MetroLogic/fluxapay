import PaymentMonitor from "@/features/admin/payments/PaymentMonitor";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Payments Monitor | FluxaPay",
  description: "Monitor platform payments",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPaymentsPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <PaymentMonitor />
    </div>
  );
}
