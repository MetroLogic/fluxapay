import { memo } from "react";
import { Badge } from "@/components/Badge";
import { PaymentStatus } from "./types";

/** All Prisma PaymentStatus values — keep in sync with schema.prisma */
export const PAYMENT_STATUSES = [
  "pending",
  "partially_paid",
  "confirmed",
  "overpaid",
  "expired",
  "failed",
  "paid",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const satisfies readonly PaymentStatus[];

export const PaymentStatusBadge = memo(({ status }: { status: PaymentStatus }) => {
  switch (status) {
    case "confirmed":
      return <Badge variant="success">Confirmed</Badge>;
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "failed":
      return <Badge variant="error">Failed</Badge>;
    case "expired":
      return <Badge variant="secondary">Expired</Badge>;
    case "paid":
    case "completed":
      return (
        <Badge variant="success">{status === "paid" ? "Paid" : "Completed"}</Badge>
      );
    case "partially_paid":
      return (
        <Badge className="border-transparent bg-orange-500/10 text-orange-500 hover:bg-orange-500/20">
          Partially Paid
        </Badge>
      );
    case "overpaid":
      return <Badge variant="info">Overpaid</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>;
    case "refunded":
      return <Badge variant="info">Refunded</Badge>;
    case "partially_refunded":
      return (
        <Badge className="border-transparent bg-purple-500/10 text-purple-500 hover:bg-purple-500/20">
          Partially Refunded
        </Badge>
      );
    default:
      return <Badge>{String(status)}</Badge>;
  }
});
PaymentStatusBadge.displayName = "PaymentStatusBadge";
