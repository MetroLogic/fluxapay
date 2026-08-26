import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StellarPayButton } from "@/components/checkout/StellarPayButton";

vi.mock("@/components/checkout/BrowserWalletButtons", () => ({
  BrowserWalletButtons: () => <div data-testid="browser-wallet-buttons">Wallet buttons</div>,
}));

describe("StellarPayButton", () => {
  it("renders SEP-0007 deep link with amount and asset", () => {
    render(
      <StellarPayButton
        address="GADDR123"
        amount={42.5}
        assetCode="USDC"
        memo="ORDER-1"
        memoType="MEMO_TEXT"
      />,
    );

    const link = screen.getByRole("link", { name: /pay 42.5 USDC with a Stellar wallet app/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("web+stellar:pay?"));
    expect(link.getAttribute("href")).toContain("destination=GADDR123");
    expect(link.getAttribute("href")).toContain("amount=42.5");
    expect(link.getAttribute("href")).toContain("asset_code=USDC");
    expect(link.getAttribute("href")).toContain("memo=ORDER-1");
  });

  it("renders browser wallet buttons when paymentId is provided", () => {
    render(
      <StellarPayButton
        address="GADDR123"
        amount={10}
        paymentId="pay_abc"
      />,
    );

    expect(screen.getByTestId("browser-wallet-buttons")).toBeInTheDocument();
    expect(screen.getByText(/or use mobile wallet/i)).toBeInTheDocument();
  });

  it("omits browser wallet section without paymentId", () => {
    render(
      <StellarPayButton
        address="GADDR123"
        amount={10}
      />,
    );

    expect(screen.queryByTestId("browser-wallet-buttons")).toBeNull();
    expect(screen.getByRole("link", { name: /pay with wallet app/i })).toBeInTheDocument();
  });
});
