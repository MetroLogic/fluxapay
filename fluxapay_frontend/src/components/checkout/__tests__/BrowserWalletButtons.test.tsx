import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserWalletButtons } from "@/components/checkout/BrowserWalletButtons";

const { mockWalletKit, mockWalletConnectConstructor } = vi.hoisted(() => ({
  mockWalletKit: {
    init: vi.fn(),
    authModal: vi.fn(),
    signTransaction: vi.fn(),
  },
  mockWalletConnectConstructor: vi.fn(),
}));

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({
  StellarWalletsKit: mockWalletKit,
}));

vi.mock("@creit.tech/stellar-wallets-kit/types", () => ({
  Networks: {
    PUBLIC: "public-passphrase",
    TESTNET: "testnet-passphrase",
  },
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/utils", () => ({
  defaultModules: vi.fn(() => [{ productId: "default-wallet" }]),
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/wallet-connect", () => ({
  WalletConnectModule: class {
    constructor(options: unknown) {
      mockWalletConnectConstructor(options);
    }
  },
  WalletConnectTargetChain: {
    PUBLIC: "stellar:pubnet",
    TESTNET: "stellar:testnet",
  },
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockWalletKit.init.mockReset();
  mockWalletKit.authModal.mockReset().mockResolvedValue({ address: "GUSER123" });
  mockWalletKit.signTransaction.mockReset().mockResolvedValue({ signedTxXdr: "signed-xdr" });
  mockWalletConnectConstructor.mockReset();
  delete (window as Window & { freighterApi?: unknown }).freighterApi;
  delete (window as Window & { albedo?: unknown }).albedo;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
      expect(screen.getByRole("button", { name: /connect stellar wallet/i })).toBeInTheDocument();
    });
  });

  it("connects through WalletConnect and signs/submits a payment transaction", async () => {
    vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "test-walletconnect-project");
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ xdr: "unsigned-xdr" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hash: "walletconnect-tx-hash" }),
      });

    const onConfirmed = vi.fn();
    render(
      <BrowserWalletButtons
        address="GADDR"
        amount={25}
        paymentId="pay_walletconnect"
        onPaymentConfirmed={onConfirmed}
      />,
    );

    const connectButton = await screen.findByRole("button", { name: /connect stellar wallet/i });
    await userEvent.click(connectButton);

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalledWith("walletconnect-tx-hash");
      expect(screen.getByText(/payment submitted successfully/i)).toBeInTheDocument();
    });

    expect(mockWalletConnectConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-walletconnect-project",
        allowedChains: ["stellar:testnet"],
      }),
    );
    expect(mockWalletKit.authModal).toHaveBeenCalledOnce();
    expect(mockWalletKit.signTransaction).toHaveBeenCalledWith("unsigned-xdr", {
      networkPassphrase: "testnet-passphrase",
      address: "GUSER123",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/payments/pay_walletconnect/build-transaction"),
      expect.objectContaining({ method: "POST" }),
    );
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
