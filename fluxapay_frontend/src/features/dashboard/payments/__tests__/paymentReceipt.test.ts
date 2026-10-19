import { describe, expect, it, vi } from "vitest";

const receiptMocks = vi.hoisted(() => {
  const addImageMock = vi.fn();
  const saveMock = vi.fn();
  const textWithLinkMock = vi.fn();
  const autoTableMock = vi.fn();
  class MockJsPdf {
    internal = { pageSize: { getWidth: () => 210 } };
    setFillColor = vi.fn();
    rect = vi.fn();
    addImage = addImageMock;
    setTextColor = vi.fn();
    setFontSize = vi.fn();
    setFont = vi.fn();
    text = vi.fn();
    textWithLink = textWithLinkMock;
    splitTextToSize = vi.fn((text: string) => [text]);
    save = saveMock;
  }
  return { MockJsPdf, addImageMock, saveMock, textWithLinkMock, autoTableMock };
});

vi.mock("jspdf", () => ({
  default: receiptMocks.MockJsPdf,
}));
vi.mock("jspdf-autotable", () => ({ default: receiptMocks.autoTableMock }));

import {
  formatReceiptCurrency,
  formatReceiptDate,
  generatePaymentReceiptPdf,
} from "../paymentReceipt";

describe("payment receipt PDF", () => {
  it("formats fiat and non-ISO token amounts for the selected locale", () => {
    expect(formatReceiptCurrency(1234.5, "USD", "en-US")).toBe("$1,234.50");
    expect(formatReceiptCurrency(1234.5, "USDC", "en-US")).toBe("1,234.5 USDC");
  });

  it("formats dates using the selected locale", () => {
    expect(formatReceiptDate("2026-04-05T12:00:00.000Z", "en-US")).toContain("April");
  });

  it("includes a verification QR and explorer link in the generated PDF", () => {
    generatePaymentReceiptPdf({
      paymentId: "pay_123",
      createdAt: "2026-04-05T12:00:00.000Z",
      amount: 10,
      currency: "USDC",
      transactionHash: "stellar-hash",
      transactionUrl: "https://stellar.expert/explorer/testnet/tx/stellar-hash",
      qrCodeDataUrl: "data:image/png;base64,qr",
      merchantName: "Fluxa Merchant",
      settlement: { fees: "0.15", currency: "USD" },
    });

    expect(receiptMocks.textWithLinkMock).toHaveBeenCalledWith(
      "View on Stellar Expert",
      18,
      expect.any(Number),
      { url: "https://stellar.expert/explorer/testnet/tx/stellar-hash" },
    );
    expect(receiptMocks.addImageMock).toHaveBeenCalledWith("data:image/png;base64,qr", "PNG", 160, expect.any(Number), 32, 32);
    expect(receiptMocks.saveMock).toHaveBeenCalledWith("receipt-pay_123.pdf");
  });

  it("fails clearly if a transaction hash or QR is missing", () => {
    expect(() =>
      generatePaymentReceiptPdf({
        paymentId: "pay_123",
        createdAt: "2026-04-05T12:00:00.000Z",
        amount: 10,
        currency: "USDC",
        transactionHash: "",
        transactionUrl: "",
        qrCodeDataUrl: "",
        merchantName: "Fluxa Merchant",
      }),
    ).toThrow("A transaction hash and verification QR code are required.");
  });
});