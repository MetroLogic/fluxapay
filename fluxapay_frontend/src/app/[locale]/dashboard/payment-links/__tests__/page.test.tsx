import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PaymentLinksPage } from "@/features/dashboard/payment-links/PaymentLinksPage";

describe("payment links page smoke", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading skeleton then empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );

    render(<PaymentLinksPage />);

    expect(screen.getByTestId("payment-links-skeleton")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/no payment links yet/i)).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("renders payment links table when data exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "link_1",
            slug: "product-a",
            label: "Product A",
            amount: 99.99,
            currency: "USD",
            active: true,
            clicks: 5,
            conversions: 2,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    render(<PaymentLinksPage />);

    await waitFor(() => {
      expect(screen.getByText("Product A")).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });
});
