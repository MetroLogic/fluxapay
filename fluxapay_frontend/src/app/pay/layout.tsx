import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Complete Your Payment - FluxaPay",
  description:
    "Securely complete your payment with FluxaPay. We accept cryptocurrency and fiat payments.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
