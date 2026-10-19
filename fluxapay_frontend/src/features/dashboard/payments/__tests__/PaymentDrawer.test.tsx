import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { PaymentDrawer } from "../PaymentDrawer";
import { useRouter } from "next/navigation";
import type { Payment } from "../types";

const { getPaymentById } = vi.hoisted(() => ({ getPaymentById: vi.fn() }));

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
    payments: { getById: getPaymentById },
  },
}));

vi.mock("qrcode.react", () => ({
  QRCodeCanvas: (props: React.CanvasHTMLAttributes<HTMLCanvasElement>) => <canvas {...props} />,
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

describe("PaymentDrawer", () => {
  const mockPush = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);
    getPaymentById.mockReset();
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
    render(<PaymentDrawer payment={mockPayment} isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Payment Details")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<PaymentDrawer payment={mockPayment} isOpen={false} onClose={mockOnClose} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onClose and navigates when 'View Full Details' bottom button is clicked", () => {
    render(<PaymentDrawer payment={mockPayment} isOpen={true} onClose={mockOnClose} />);
    
    // There are two buttons for viewing detailed page (header and bottom). 
    // If there are multiple, getByRole will fail, so we should be more specific,
    // or just use getAllByRole and click the last one
    const buttons = screen.getAllByRole("button", { name: "View detailed payment page" });
    
    fireEvent.click(buttons[buttons.length - 1]);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(`/dashboard/payments/${mockPayment.id}`);
  });

  it("announces receipt generation failures accessibly", async () => {
    const completedPayment = {
      ...mockPayment,
      status: "completed",
      txHash: "stellar-hash",
    } as unknown as Payment;
    getPaymentById.mockRejectedValueOnce(new Error("Payment details unavailable"));

    render(<PaymentDrawer payment={completedPayment} isOpen onClose={mockOnClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Download Receipt" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Payment details unavailable"),
    );
  });
});
