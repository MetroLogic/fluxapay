import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import {
  calculateFeeBreakdown,
  FeeBreakdownPreview,
  PLATFORM_FEE_RATE,
  STELLAR_NETWORK_FEE_USDC,
} from "../FeeBreakdownPreview";

// ─── Mock useFxRate so the component works in isolation ──────────────────────
vi.mock("@/hooks/useFxRate", () => ({
  useFxRate: vi.fn(),
}));

import { useFxRate } from "@/hooks/useFxRate";
const mockUseFxRate = vi.mocked(useFxRate);

const defaultFxMock = {
  rateData: { rate: 1500, currency: "NGN", base: "USDC", updatedAt: new Date().toISOString() },
  isLoading: false,
  error: null,
  mutate: vi.fn(),
};

beforeEach(() => {
  mockUseFxRate.mockReturnValue(defaultFxMock as ReturnType<typeof useFxRate>);
});

// ─── Pure calculation tests ──────────────────────────────────────────────────
describe("calculateFeeBreakdown", () => {
  it("computes platform fee as PLATFORM_FEE_RATE × gross", () => {
    const bd = calculateFeeBreakdown(100, "NGN", null);
    expect(bd.platformFeeUsdc).toBeCloseTo(100 * PLATFORM_FEE_RATE, 10);
  });

  it("always includes the fixed Stellar network fee", () => {
    const bd = calculateFeeBreakdown(50, "USD", null);
    expect(bd.networkFeeUsdc).toBe(STELLAR_NETWORK_FEE_USDC);
  });

  it("net USDC = gross - platform fee - network fee", () => {
    const gross = 200;
    const bd = calculateFeeBreakdown(gross, "USD", null);
    const expected = gross - gross * PLATFORM_FEE_RATE - STELLAR_NETWORK_FEE_USDC;
    expect(bd.netUsdc).toBeCloseTo(expected, 8);
  });

  it("total fees = platform fee + network fee", () => {
    const bd = calculateFeeBreakdown(100, "EUR", null);
    expect(bd.totalFeesUsdc).toBeCloseTo(
      bd.platformFeeUsdc + bd.networkFeeUsdc,
      10,
    );
  });

  it("estimatedFiatPayout is null when fxRate is null", () => {
    const bd = calculateFeeBreakdown(100, "NGN", null);
    expect(bd.estimatedFiatPayout).toBeNull();
  });

  it("estimatedFiatPayout = netUsdc * fxRate", () => {
    const fxRate = 1500;
    const bd = calculateFeeBreakdown(100, "NGN", fxRate);
    expect(bd.estimatedFiatPayout).toBeCloseTo(bd.netUsdc * fxRate, 4);
  });

  it("handles zero amount without going negative", () => {
    const bd = calculateFeeBreakdown(0, "USD", 1);
    expect(bd.grossUsdc).toBe(0);
    expect(bd.netUsdc).toBe(0);
  });

  it("handles very small amounts — net cannot be negative", () => {
    // Amount smaller than the network fee alone
    const bd = calculateFeeBreakdown(0.00005, "USD", 1);
    expect(bd.netUsdc).toBeGreaterThanOrEqual(0);
  });

  it("stores the currency and fxRate in the result", () => {
    const bd = calculateFeeBreakdown(100, "KES", 130);
    expect(bd.currency).toBe("KES");
    expect(bd.fxRate).toBe(130);
  });

  it("uses PLATFORM_FEE_RATE constant (1.5%)", () => {
    expect(PLATFORM_FEE_RATE).toBe(0.015);
  });

  it("uses STELLAR_NETWORK_FEE_USDC constant (0.0001)", () => {
    expect(STELLAR_NETWORK_FEE_USDC).toBe(0.0001);
  });

  describe("multi-currency fiat payouts", () => {
    it.each([
      ["USD", 1, 100],
      ["EUR", 0.91, 100],
      ["GBP", 0.78, 100],
      ["NGN", 1500, 100],
      ["KES", 130, 100],
      ["GHS", 16, 100],
    ])("calculates payout for %s correctly", (currency, rate, amount) => {
      const bd = calculateFeeBreakdown(amount, currency, rate);
      expect(bd.estimatedFiatPayout).toBeCloseTo(bd.netUsdc * rate, 4);
      expect(bd.currency).toBe(currency);
    });
  });
});

// ─── Component rendering tests ───────────────────────────────────────────────
describe("FeeBreakdownPreview component", () => {
  it("renders nothing when amountRaw is empty", () => {
    const { container } = render(
      <FeeBreakdownPreview amountRaw="" currency="USD" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when amountRaw is NaN", () => {
    const { container } = render(
      <FeeBreakdownPreview amountRaw="abc" currency="USD" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when amountRaw is zero", () => {
    const { container } = render(
      <FeeBreakdownPreview amountRaw="0" currency="USD" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the breakdown card when a valid amount is provided", () => {
    render(<FeeBreakdownPreview amountRaw="100" currency="NGN" />);
    expect(
      screen.getByTestId("fee-breakdown-preview"),
    ).toBeInTheDocument();
  });

  it("shows Fee Breakdown Preview heading", () => {
    render(<FeeBreakdownPreview amountRaw="100" currency="NGN" />);
    expect(screen.getByText(/fee breakdown preview/i)).toBeInTheDocument();
  });

  it("displays Gross Amount with correct value", () => {
    render(<FeeBreakdownPreview amountRaw="100" currency="NGN" />);
    expect(screen.getByText("100.00 USDC")).toBeInTheDocument();
  });

  it("displays platform fee (1.5%)", () => {
    render(<FeeBreakdownPreview amountRaw="100" currency="NGN" />);
    // platform fee = 100 * 0.015 = 1.5
    expect(screen.getByText(/platform fee.*1\.5%/i)).toBeInTheDocument();
  });

  it("displays estimated fiat payout when FX rate is available", async () => {
    render(<FeeBreakdownPreview amountRaw="100" currency="NGN" />);
    await waitFor(() => {
      expect(screen.getByTestId("estimated-fiat-payout")).toBeInTheDocument();
    });
  });

  it("shows loading state while FX rate is loading", () => {
    mockUseFxRate.mockReturnValueOnce({
      ...defaultFxMock,
      rateData: undefined,
      isLoading: true,
    } as ReturnType<typeof useFxRate>);
    render(<FeeBreakdownPreview amountRaw="100" currency="NGN" />);
    expect(screen.getByText(/loading rate/i)).toBeInTheDocument();
  });

  it("shows error state when FX rate fails", () => {
    mockUseFxRate.mockReturnValueOnce({
      ...defaultFxMock,
      rateData: undefined,
      isLoading: false,
      error: new Error("FX unavailable"),
    } as ReturnType<typeof useFxRate>);
    render(<FeeBreakdownPreview amountRaw="100" currency="NGN" />);
    expect(screen.getByText(/fx rate unavailable/i)).toBeInTheDocument();
  });

  it("shows disclaimer text", () => {
    render(<FeeBreakdownPreview amountRaw="100" currency="USD" />);
    expect(screen.getByText(/estimates only/i)).toBeInTheDocument();
  });

  it("updates calculation when amount changes", () => {
    const { rerender } = render(
      <FeeBreakdownPreview amountRaw="100" currency="USD" />,
    );
    expect(screen.getByText("100.00 USDC")).toBeInTheDocument();

    rerender(<FeeBreakdownPreview amountRaw="200" currency="USD" />);
    expect(screen.getByText("200.00 USDC")).toBeInTheDocument();
  });
});
