import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  PAYMENT_STATUSES,
  PaymentStatusBadge,
} from "@/features/dashboard/payments/PaymentStatusBadge";
import type { PaymentStatus } from "@/features/dashboard/payments/types";

const BADGE_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  partially_paid: "Partially Paid",
  confirmed: "Confirmed",
  overpaid: "Overpaid",
  expired: "Expired",
  failed: "Failed",
  paid: "Paid",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partially Refunded",
};

describe("PaymentStatusBadge", () => {
  it("covers every Prisma PaymentStatus value", () => {
    expect(PAYMENT_STATUSES).toHaveLength(11);
  });

  it.each(PAYMENT_STATUSES.map((status) => [status, BADGE_LABELS[status]] as const))(
    "renders badge for %s",
    (status, label) => {
      render(<PaymentStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );
});
