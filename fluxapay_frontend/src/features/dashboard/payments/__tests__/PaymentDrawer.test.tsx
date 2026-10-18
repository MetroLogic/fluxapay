import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentDrawer } from "../PaymentDrawer";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Payment } from "../types";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    webhooks: {
      logs: vi.fn().mockResolvedValue({ data: [] }),
    },
    refunds: {
      list: vi.fn(),
      initiate: vi.fn(),
    },
  },
}));

describe("PaymentDrawer", () => {
  const mockPush = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnRefundSuccess = vi.fn();

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
    });
    vi.clearAllMocks();
  });

  const mockPayment = {
    id: "pay_123",
    amount: 100,
    currency: "USD",
    status: "pending",
    createdAt: new Date().toISOString(),
    customerEmail: "test@example.com",
    customerName: "Test User",
  } as unknown as Payment;

  it("renders the drawer when open", () => {
    render(
      <PaymentDrawer
        payment={mockPayment}
        isOpen={true}
        onClose={mockOnClose}
        onRefundSuccess={mockOnRefundSuccess}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Payment Details")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <PaymentDrawer
        payment={mockPayment}
        isOpen={false}
        onClose={mockOnClose}
        onRefundSuccess={mockOnRefundSuccess}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the refund modal for refundable payments", async () => {
    vi.mocked(api.refunds.list).mockResolvedValue({
      data: { data: { refunds: [], pagination: { total_pages: 0 } } },
    });
    const refundablePayment = {
      ...mockPayment,
      currency: "USDC",
      status: "confirmed",
    } as Payment;
    render(
      <PaymentDrawer
        payment={refundablePayment}
        isOpen={true}
        onClose={mockOnClose}
        onRefundSuccess={mockOnRefundSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Issue Refund" }));

    expect(await screen.findByLabelText(/Refund amount/)).toHaveValue(100);
    expect(api.refunds.list).toHaveBeenCalledWith({
      paymentId: refundablePayment.id,
      page: 1,
      limit: 100,
      signal: expect.any(AbortSignal),
    });
  });

  it("calls onClose and navigates when 'View Full Details' bottom button is clicked", () => {
    render(
      <PaymentDrawer
        payment={mockPayment}
        isOpen={true}
        onClose={mockOnClose}
        onRefundSuccess={mockOnRefundSuccess}
      />,
    );
    
    // There are two buttons for viewing detailed page (header and bottom). 
    // If there are multiple, getByRole will fail, so we should be more specific,
    // or just use getAllByRole and click the last one
    const buttons = screen.getAllByRole("button", { name: "View detailed payment page" });
    
    fireEvent.click(buttons[buttons.length - 1]);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(`/dashboard/payments/${mockPayment.id}`);
  });
});
