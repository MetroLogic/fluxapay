import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserWalletButtons } from "@/components/checkout/BrowserWalletButtons";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  delete (window as Window & { freighterApi?: unknown }).freighterApi;
  delete (window as Window & { albedo?: unknown }).albedo;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BrowserWalletButtons", () => {
  it("detects Freighter and shows Pay with Freighter button", async () => {
    window.freighterApi = {
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getPublicKey: vi.fn(),
      signTransaction: vi.fn(),
    };

    render(
      <BrowserWalletButtons
        address="GADDR"
        amount={10}
        paymentId="pay_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pay with freighter/i })).toBeInTheDocument();
    });
  });

  it("shows install links when no browser wallet is detected", async () => {
    render(
      <BrowserWalletButtons
        address="GADDR"
        amount={10}
        paymentId="pay_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/no browser wallet detected/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /install freighter/i })).toBeInTheDocument();
    });
  });

  it("builds and submits a Freighter transaction to Horizon", async () => {
    window.freighterApi = {
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getPublicKey: vi.fn().mockResolvedValue("GUSER123"),
      signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: "signed-xdr" }),
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ xdr: "unsigned-xdr" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hash: "abc123hash" }),
      });

    const onConfirmed = vi.fn();
    render(
      <BrowserWalletButtons
        address="GADDR"
        amount={25}
        paymentId="pay_456"
        onPaymentConfirmed={onConfirmed}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pay with freighter/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /pay with freighter/i }));

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalledWith("abc123hash");
      expect(screen.getByText(/payment submitted successfully/i)).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/payments/pay_456/build-transaction"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/transactions"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
