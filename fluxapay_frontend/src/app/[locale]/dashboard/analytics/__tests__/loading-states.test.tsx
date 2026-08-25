/**
 * Loading and empty states for the analytics dashboard (#778).
 *
 * The user-visible bug is a blank flash followed by charts popping in, so
 * these assert the three states the page can be in — loading, empty, loaded —
 * and that the skeleton's wrappers mirror the loaded layout, which is what
 * actually keeps the shift out.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AnalyticsPage from "@/app/[locale]/dashboard/analytics/page";
import { useDashboardAnalytics } from "@/hooks/useDashboardAnalytics";

vi.mock("@/hooks/useDashboardAnalytics", () => ({
  useDashboardAnalytics: vi.fn(),
}));

// The charts render a canvas-backed library that jsdom cannot draw.
vi.mock("@/features/analytics/components/RevenueTrendsChart", () => ({
  RevenueTrendsChart: () => <div data-testid="revenue-trends-chart" />,
}));
vi.mock("@/features/analytics/components/PaymentMethodsChart", () => ({
  PaymentMethodsChart: () => <div data-testid="payment-methods-chart" />,
}));
vi.mock("@/features/analytics/components/RevenueByCountryChart", () => ({
  RevenueByCountryChart: () => <div data-testid="revenue-by-country-chart" />,
}));

const mockUseDashboardAnalytics = vi.mocked(useDashboardAnalytics);

const emptySummary = {
  totalRevenue: 0,
  totalPayments: 0,
  activeMerchants: 0,
  growthRate: 0,
};

function mockAnalytics(overrides: Record<string, unknown> = {}) {
  mockUseDashboardAnalytics.mockReturnValue({
    summary: emptySummary,
    revenueTrends: [],
    paymentDistribution: [],
    revenueByCountry: [],
    isLoading: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useDashboardAnalytics>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analytics loading state", () => {
  it("renders the skeleton while the request is in flight", () => {
    mockAnalytics({ isLoading: true });

    render(<AnalyticsPage />);

    expect(screen.getByTestId("analytics-skeleton")).toBeInTheDocument();
    // No blank area, and no charts popping in early.
    expect(screen.queryByTestId("revenue-trends-chart")).toBeNull();
    expect(screen.queryByTestId("empty-chart")).toBeNull();
  });

  it("hides the skeleton once data arrives", () => {
    mockAnalytics({
      revenueTrends: [{ date: "2026-01-01", revenue: 100 }],
      paymentDistribution: [{ method: "card", value: 1 }],
      revenueByCountry: [{ country: "NG", revenue: 10 }],
    });

    render(<AnalyticsPage />);

    expect(screen.queryByTestId("analytics-skeleton")).toBeNull();
    expect(screen.getByTestId("revenue-trends-chart")).toBeInTheDocument();
  });

  it("keeps the skeleton out of the accessibility tree", () => {
    mockAnalytics({ isLoading: true });

    render(<AnalyticsPage />);

    expect(screen.getByTestId("analytics-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

describe("analytics empty state", () => {
  it("renders an empty chart for every series when all are empty", () => {
    mockAnalytics();

    render(<AnalyticsPage />);

    expect(screen.getAllByTestId("empty-chart")).toHaveLength(3);
    expect(screen.queryByTestId("analytics-skeleton")).toBeNull();
  });

  it("renders the empty state only for the series that are empty", () => {
    mockAnalytics({
      revenueTrends: [{ date: "2026-01-01", revenue: 100 }],
    });

    render(<AnalyticsPage />);

    expect(screen.getByTestId("revenue-trends-chart")).toBeInTheDocument();
    expect(screen.getAllByTestId("empty-chart")).toHaveLength(2);
  });

  it("names the missing series in the empty copy", () => {
    mockAnalytics();

    render(<AnalyticsPage />);

    expect(
      screen.getByText(/no revenue trend data for this period/i),
    ).toBeInTheDocument();
  });
});

describe("layout stability", () => {
  /** Read the class list of each direct child of the skeleton / loaded root. */
  function childClassNames(root: Element): string[] {
    return Array.from(root.children).map((c) => c.className);
  }

  it("gives the skeleton and the loaded view the same chart grid spans", () => {
    mockAnalytics({ isLoading: true });
    const loading = render(<AnalyticsPage />);
    const skeleton = screen.getByTestId("analytics-skeleton");
    const skeletonChartRow = childClassNames(skeleton).find((c) =>
      c.includes("lg:grid-cols-7"),
    );
    expect(skeletonChartRow).toBeDefined();

    const skeletonSpans = Array.from(
      skeleton.querySelectorAll('[class*="lg:col-span-"]'),
    ).map((el) => el.className);
    loading.unmount();

    mockAnalytics({
      revenueTrends: [{ date: "2026-01-01", revenue: 100 }],
      paymentDistribution: [{ method: "card", value: 1 }],
      revenueByCountry: [{ country: "NG", revenue: 10 }],
    });
    const { container } = render(<AnalyticsPage />);
    const loadedSpans = Array.from(
      container.querySelectorAll('[class*="lg:col-span-"]'),
    ).map((el) => el.className);

    expect(skeletonSpans).toHaveLength(loadedSpans.length);
    // Both must collapse identically at md — bare col-span-N in the skeleton
    // was the layout shift.
    expect(skeletonSpans.every((c) => c.includes("col-span-full"))).toBe(true);
    expect(loadedSpans.every((c) => c.includes("col-span-full"))).toBe(true);
    expect(skeletonSpans[0]).toContain("lg:col-span-4");
    expect(skeletonSpans[1]).toContain("lg:col-span-3");
    expect(loadedSpans[0]).toContain("lg:col-span-4");
    expect(loadedSpans[1]).toContain("lg:col-span-3");
  });

  it("sizes the empty chart like a rendered chart", () => {
    mockAnalytics();

    render(<AnalyticsPage />);

    for (const empty of screen.getAllByTestId("empty-chart")) {
      expect(empty.className).toContain("h-[300px]");
    }
  });
});
