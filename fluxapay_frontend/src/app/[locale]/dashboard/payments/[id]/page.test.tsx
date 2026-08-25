import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useParams: () => ({ id: "invalid-id" }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/dashboard/payments/PaymentDetails", () => ({
  PaymentDetails: () => null,
}));

import PaymentDetailsPage, { mapBackendPayment } from "./page";
import { notFound } from "next/navigation";

const fetchMock = vi.fn();

describe("PaymentDetailsPage", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders not-found UI for an invalid payment ID", async () => {
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
});
