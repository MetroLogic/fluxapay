import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PaymentsPage from "@/app/[locale]/dashboard/payments/page";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

const push = vi.fn();
const replace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => "/dashboard/payments",
  useParams: () => ({ locale: "en" }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  api: {
    payments: {
      list: vi.fn(),
      create: vi.fn(),
      getById: vi.fn(),
      export: vi.fn(),
    },
  },
}));

vi.mock("@/hooks/usePaymentUpdates", () => ({
  usePaymentUpdates: () => ({ isConnected: true }),
}));

vi.mock("@/hooks/useMerchantDataExport", () => ({
  useMerchantDataExport: () => ({
    exportData: vi.fn(),
    exportingFormat: null,
  }),
}));

const listMock = vi.mocked(api.payments.list);

function createMockPayments(count: number, startIndex = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: `pay_${startIndex + i}`,
    amount: 100,
    currency: "USDC",
    status: "confirmed" as const,
    merchantId: "merch_1",
    customer_email: `user${startIndex + i}@example.com`,
    createdAt: new Date(Date.now() - (startIndex + i) * 60000).toISOString(),
  }));
}

describe("Merchant Transaction History — cursor-based pagination (#1210)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();
    const storage: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => { storage[key] = val; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(),
    });
  });

  it("loads first page with default limit 25 and shows nextCursor Load More control", async () => {
    const page1Data = createMockPayments(25, 0);
    listMock.mockResolvedValueOnce({
      data: page1Data as any,
      nextCursor: "cursor_page_1",
      meta: {
        total: 50,
        page: 1,
        limit: 25,
        totalPages: 2,
        hasNextPage: true,
        nextCursor: "cursor_page_1",
      },
    });

    render(<PaymentsPage />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25 }),
        expect.any(Object),
      );
    });

    expect(await screen.findByText("Showing 25 of 50 transactions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });

  it("loads subsequent page using nextCursor and appends records without duplicates", async () => {
    const page1Data = createMockPayments(25, 0);
    const page2Data = createMockPayments(10, 25);

    listMock
      .mockResolvedValueOnce({
        data: page1Data as any,
        nextCursor: "cursor_page_1",
        meta: { total: 35, limit: 25, hasNextPage: true, nextCursor: "cursor_page_1" },
      })
      .mockResolvedValueOnce({
        data: page2Data as any,
        nextCursor: null,
        meta: { total: 35, limit: 25, hasNextPage: false, nextCursor: null },
      });

    render(<PaymentsPage />);

    const loadMoreButton = await screen.findByRole("button", { name: /load more/i });
    expect(loadMoreButton).toBeInTheDocument();

    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: "cursor_page_1", limit: 25 }),
      );
    });

    // Both batches should now be present (25 + 10 = 35)
    await waitFor(() => {
      expect(screen.getByText("Showing 35 of 35 transactions")).toBeInTheDocument();
    });

    // On the final page, Load More button is replaced with "All transactions loaded"
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByText("All transactions loaded")).toBeInTheDocument();
  });

  it("handles empty transaction history correctly", async () => {
    listMock.mockResolvedValueOnce({
      data: [],
      nextCursor: null,
      meta: { total: 0, limit: 25, hasNextPage: false, nextCursor: null },
    });

    render(<PaymentsPage />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
    });

    expect(await screen.findByText("No results")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("handles load more error gracefully with toast feedback", async () => {
    const page1Data = createMockPayments(25, 0);

    listMock
      .mockResolvedValueOnce({
        data: page1Data as any,
        nextCursor: "cursor_page_1",
        meta: { total: 50, limit: 25, hasNextPage: true, nextCursor: "cursor_page_1" },
      })
      .mockRejectedValueOnce(new Error("Network failure"));

    render(<PaymentsPage />);

    const loadMoreButton = await screen.findByRole("button", { name: /load more/i });
    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load more transactions.");
    });

    // Existing payments remain intact
    expect(screen.getByText("Showing 25 of 50 transactions")).toBeInTheDocument();
  });
});
