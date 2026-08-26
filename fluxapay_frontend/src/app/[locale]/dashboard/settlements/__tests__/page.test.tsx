import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SettlementsRoutePage from "@/app/[locale]/dashboard/settlements/page";
import { useSettlements, useSettlementSummary } from "@/hooks/useSettlements";

vi.mock("@/hooks/useSettlements", () => ({
  useSettlements: vi.fn(),
  useSettlementSummary: vi.fn(),
}));

vi.mock("@/hooks/useMerchantDataExport", () => ({
  useMerchantDataExport: () => ({ exportData: vi.fn(), exportingFormat: null }),
}));

const mockUseSettlements = vi.mocked(useSettlements);
const mockUseSettlementSummary = vi.mocked(useSettlementSummary);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSettlementSummary.mockReturnValue({
    summary: null,
    isLoading: true,
  } as ReturnType<typeof useSettlementSummary>);
});

describe("settlements page smoke", () => {
  it("renders loading state", () => {
    mockUseSettlements.mockReturnValue({
      settlements: [],
      pagination: null,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useSettlements>);

    render(<SettlementsRoutePage />);

    expect(screen.getByText("Settlements")).toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders empty state when no settlements", () => {
    mockUseSettlements.mockReturnValue({
      settlements: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSettlements>);
    mockUseSettlementSummary.mockReturnValue({
      summary: { total_settled_this_month: 0, total_fees_paid: 0 },
      isLoading: false,
    } as ReturnType<typeof useSettlementSummary>);

    render(<SettlementsRoutePage />);

    expect(screen.getByText(/no settlements found matching your filters/i)).toBeInTheDocument();
  });
});
