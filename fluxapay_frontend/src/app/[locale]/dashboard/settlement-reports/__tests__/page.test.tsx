import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SettlementReportsRoutePage from "@/app/[locale]/dashboard/settlement-reports/page";
import { useSettlements, useSettlementDetails } from "@/hooks/useSettlements";

vi.mock("@/hooks/useSettlements", () => ({
  useSettlements: vi.fn(),
  useSettlementDetails: vi.fn(),
  useSettlementExport: () => ({ download: vi.fn(), exporting: false }),
}));

vi.mock("@/lib/api", () => ({
  api: { settlements: { exportRange: vi.fn() } },
}));

const mockUseSettlements = vi.mocked(useSettlements);
const mockUseSettlementDetails = vi.mocked(useSettlementDetails);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSettlementDetails.mockReturnValue({
    detail: null,
    isLoading: false,
  } as ReturnType<typeof useSettlementDetails>);
});

describe("settlement reports page smoke", () => {
  it("renders loading state", () => {
    mockUseSettlements.mockReturnValue({
      settlements: [],
      isLoading: true,
      error: null,
    } as ReturnType<typeof useSettlements>);

    render(<SettlementReportsRoutePage />);

    expect(screen.getByText("Settlement Reports")).toBeInTheDocument();
    expect(screen.getByText(/loading settlements/i)).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseSettlements.mockReturnValue({
      settlements: [],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSettlements>);

    render(<SettlementReportsRoutePage />);

    expect(screen.getByText(/no settlements found for this period/i)).toBeInTheDocument();
  });
});
