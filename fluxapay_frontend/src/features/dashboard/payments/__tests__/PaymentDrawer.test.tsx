import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PaymentDrawer } from "../PaymentDrawer";
import { useRouter } from "next/navigation";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// Mock the API
jest.mock("@/lib/api", () => ({
  api: {
    webhooks: {
      logs: jest.fn().mockResolvedValue({ data: [] }),
    },
  },
}));

describe("PaymentDrawer", () => {
  const mockPush = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    jest.clearAllMocks();
  });

  const mockPayment = {
    id: "pay_123",
    amount: 100,
    currency: "USD",
    status: "pending",
    createdAt: new Date().toISOString(),
    customerEmail: "test@example.com",
    customerName: "Test User",
  } as unknown as import("../types").Payment;

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
    // We target the one at the bottom by text.
    const bottomButton = screen.getByRole("button", { name: "View detailed payment page" });
    
    // If there are multiple, getByRole will fail, so we should be more specific,
    // or just use getAllByRole and click the last one
    const buttons = screen.getAllByRole("button", { name: "View detailed payment page" });
    
    fireEvent.click(buttons[buttons.length - 1]);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(`/dashboard/payments/${mockPayment.id}`);
  });
});
