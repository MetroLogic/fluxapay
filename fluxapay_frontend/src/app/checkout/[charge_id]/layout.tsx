import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout | FluxaPay",
  description: "Complete your USDC payment securely via FluxaPay hosted checkout.",
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
