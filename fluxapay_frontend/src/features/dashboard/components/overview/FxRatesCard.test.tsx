import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FxRatesCard } from "./FxRatesCard";
import { useDashboardFxRates } from "@/hooks/useDashboardFxRates";

vi.mock("@/hooks/useDashboardFxRates", () => ({
  useDashboardFxRates: vi.fn(),
}));

vi.mock("recharts", () => ({
  Line: () => null,
  LineChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
}));

const mockUseDashboardFxRates = vi.mocked(useDashboardFxRates);

describe("FxRatesCard", () => {
  const refresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDashboardFxRates.mockReturnValue({
      rates: [
        { pair: "XLM/USD", rate: 0.12, change24h: 1.5, updatedAt: new Date().toISOString(), points: [] },
        { pair: "USDC/NGN", rate: 1538.46, change24h: -0.4, updatedAt: new Date().toISOString(), points: [] },
        { pair: "EURC/USD", rate: 1.08, change24h: 0.02, updatedAt: new Date().toISOString(), points: [] },
      ],
      error: undefined,
      isLoading: false,
      isRefreshing: false,
      refresh,
    } as ReturnType<typeof useDashboardFxRates>);
  });

  it("shows all requested pairs and refreshes on demand", () => {
    render(<FxRatesCard />);

    expect(screen.getByRole("heading", { name: "Currency markets" })).toBeInTheDocument();
    expect(screen.getByText("XLM/USD")).toBeInTheDocument();
    expect(screen.getByText("USDC/NGN")).toBeInTheDocument();
    expect(screen.getByText("EURC/USD")).toBeInTheDocument();
    expect(screen.getByText("1.50%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh currency rates" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a retry state when rates cannot be loaded", () => {
    mockUseDashboardFxRates.mockReturnValue({
      rates: undefined,
      error: new Error("Network unavailable"),
      isLoading: false,
      isRefreshing: false,
      refresh,
    } as ReturnType<typeof useDashboardFxRates>);

    render(<FxRatesCard />);

    expect(screen.getByRole("alert")).toHaveTextContent("Currency rates could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});