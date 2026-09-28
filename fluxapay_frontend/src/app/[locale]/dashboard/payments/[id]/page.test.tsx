import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockBack = vi.fn();
const mockSearchParams = {
  get: vi.fn(),
};

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useParams: () => ({ id: "invalid-id" }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/features/dashboard/payments/PaymentDetails", () => ({
  PaymentDetails: ({ activeTab }: { activeTab?: string }) => (
    <div data-testid="payment-details" data-active-tab={activeTab || "details"}>
      Payment Details Component
    </div>
  ),
}));

import PaymentDetailsPage, { mapBackendPayment } from "./page";
import { notFound } from "next/navigation";

const fetchMock = vi.fn();

describe("PaymentDetailsPage", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
    fetchMock.mockReset();
    mockPush.mockReset();
    mockBack.mockReset();
    mockSearchParams.get.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders not-found UI for an invalid payment ID", async () => {
    mockSearchParams.get.mockReturnValue(null);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Payment not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<PaymentDetailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Payment not found" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Return to Payments" })).toHaveAttribute(
      "href",
      "/dashboard/payments",
    );
  });

  it("calls Next notFound when the payment payload is null", () => {
    expect(() => mapBackendPayment(null)).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("opens refunds tab when ?tab=refunds query parameter is present", async () => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === "tab") return "refunds";
      return null;
    });

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          payment: {
            id: "payment-123",
            amount: 100,
            currency: "USDC",
            status: "confirmed",
            merchantId: "merchant-1",
            customer_email: "test@example.com",
            createdAt: new Date().toISOString(),
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<PaymentDetailsPage />);

    await waitFor(() => {
      const paymentDetails = screen.getByTestId("payment-details");
      expect(paymentDetails).toHaveAttribute("data-active-tab", "refunds");
    });
  });

  it("defaults to details tab when no query parameter is present", async () => {
    mockSearchParams.get.mockReturnValue(null);

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          payment: {
            id: "payment-123",
            amount: 100,
            currency: "USDC",
            status: "confirmed",
            merchantId: "merchant-1",
            customer_email: "test@example.com",
            createdAt: new Date().toISOString(),
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<PaymentDetailsPage />);

    await waitFor(() => {
      const paymentDetails = screen.getByTestId("payment-details");
      expect(paymentDetails).toHaveAttribute("data-active-tab", "details");
    });
  });
});
