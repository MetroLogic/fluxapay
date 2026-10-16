import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

const save = vi.fn();
const buildInvoicePdfMock = vi.fn();
vi.mock("../invoicePdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../invoicePdf")>();
  return { ...actual, buildInvoicePdf: (...a: unknown[]) => buildInvoicePdfMock(...a) };
});

import { InvoicePreviewModal, ZOOM_LEVELS } from "../InvoicePreviewModal";
import {
  type InvoicePreviewData,
  computeInvoiceTotals,
  formatMoney,
  merchantFromProfile,
} from "../invoicePreview";
import { buildInvoicePdf as realBuildInvoicePdf, invoicePdfFileName } from "../invoicePdf";

const data: InvoicePreviewData = {
  merchant: { businessName: "Acme Coffee Ltd", email: "billing@acme.test" },
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  currency: "USD",
  dueDate: "2026-11-30",
  notes: "Thanks for your business",
  lineItems: [
    { description: "Espresso beans (1kg)", quantity: 3, unit_price: 24.5 },
    { description: "Grinder service", quantity: 1, unit_price: 1200 },
  ],
  taxRate: 7.5,
};

describe("invoicePreview helpers", () => {
  it("computes line amounts, subtotal, tax and total like the backend", () => {
    const totals = computeInvoiceTotals(data.lineItems, 7.5, "USD");
    expect(totals.lines.map((l) => l.amount)).toEqual([73.5, 1200]);
    expect(totals.subtotal).toBe(1273.5);
    expect(totals.taxAmount).toBe(95.51); // 1273.5 × 7.5% = 95.5125
    expect(totals.total).toBe(1369.01);
  });

  it("treats missing or invalid tax as zero and caps it at 100%", () => {
    expect(computeInvoiceTotals(data.lineItems).taxAmount).toBe(0);
    expect(computeInvoiceTotals(data.lineItems, -5).taxRate).toBe(0);
    expect(computeInvoiceTotals(data.lineItems, 250).taxRate).toBe(100);
  });

  it("formats money for the locale, including non-ISO crypto codes", () => {
    expect(formatMoney(1369.01, "USD", "en-US")).toBe("$1,369.01");
    expect(formatMoney(1234.5, "USDC", "en-US")).toBe("1,234.50 USDC");
    expect(formatMoney(1.2345678, "XLM", "en-US")).toMatch(/1\.2345678/);
  });

  it("reads the merchant from GET /merchants/me", () => {
    expect(
      merchantFromProfile({ message: "Merchant found", merchant: { business_name: "Acme", email: "a@b.co" } }),
    ).toEqual({ businessName: "Acme", email: "a@b.co", country: undefined });
    expect(merchantFromProfile({ data: { merchant: { business_name: "Nested" } } })?.businessName).toBe("Nested");
    expect(merchantFromProfile({})).toBeNull();
  });

  it("builds a PDF containing the merchant, customer, items and totals", () => {
    const doc = realBuildInvoicePdf(data, null);
    const pdf = doc.output();
    expect(pdf).toContain("Acme Coffee Ltd");
    expect(pdf).toContain("Jane Doe");
    expect(pdf).toContain("Espresso beans");
    expect(pdf).toContain("1,369.01 USD");
    expect(pdf).toContain("Tax \\(7.5%\\)");
    expect(invoicePdfFileName({ customerName: "Jane Doe" })).toBe("invoice-jane-doe.pdf");
    expect(invoicePdfFileName({ invoiceNumber: "INV-0042", customerName: "x" })).toBe("inv-0042.pdf");
  });
});

describe("InvoicePreviewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildInvoicePdfMock.mockReturnValue({ save });
  });

  function renderModal(props: Partial<React.ComponentProps<typeof InvoicePreviewModal>> = {}) {
    const onEdit = vi.fn();
    const onSend = vi.fn();
    render(<InvoicePreviewModal isOpen data={data} onEdit={onEdit} onSend={onSend} {...props} />);
    return { onEdit, onSend };
  }

  it("renders merchant, customer, line items, breakdown and the QR code", () => {
    renderModal();
    const sheet = screen.getByTestId("invoice-sheet");
    expect(within(sheet).getAllByText("Acme Coffee Ltd").length).toBeGreaterThan(0);
    expect(within(sheet).getByText("Jane Doe")).toBeInTheDocument();
    expect(within(sheet).getByText("jane@example.com")).toBeInTheDocument();
    expect(within(sheet).getAllByTestId("invoice-line")).toHaveLength(2);
    expect(within(sheet).getByText("$73.50")).toBeInTheDocument();
    expect(screen.getByTestId("invoice-subtotal")).toHaveTextContent("$1,273.50");
    expect(screen.getByTestId("invoice-tax")).toHaveTextContent("$95.51");
    expect(screen.getByTestId("invoice-total")).toHaveTextContent("$1,369.01");
    expect(screen.getByRole("img", { name: /payment qr code/i })).toBeInTheDocument();
  });

  it("zooms in and out within bounds and resets", () => {
    renderModal();
    const level = screen.getByTestId("zoom-level");
    expect(level).toHaveTextContent("100%");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(level).toHaveTextContent("125%");
    // jsdom does not implement CSS `zoom`, so check the value React received.
    expect(screen.getByTestId("invoice-zoom").getAttribute("style") ?? "").toMatch(/zoom|^$/);

    for (let i = 0; i < ZOOM_LEVELS.length; i++) fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(level).toHaveTextContent("50%");
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();

    fireEvent.click(level);
    expect(level).toHaveTextContent("100%");
  });

  it("wires Edit Details, Download PDF and Send to Customer", () => {
    const { onEdit, onSend } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(buildInvoicePdfMock).toHaveBeenCalledWith(data, expect.anything());
    expect(save).toHaveBeenCalledWith("invoice-jane-doe.pdf");
    expect(toastSuccess).toHaveBeenCalledWith("Invoice PDF downloaded");

    fireEvent.click(screen.getByRole("button", { name: /send to customer/i }));
    expect(onSend).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("buttons never submit an enclosing form", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <InvoicePreviewModal isOpen data={data} onEdit={vi.fn()} onSend={vi.fn()} />
      </form>,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });

  it("closes on Escape without letting the key reach other listeners", () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    const { onEdit } = renderModal();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
  });

  it("shows a loading state and disables actions until data is ready", () => {
    renderModal({ data: null });
    expect(screen.getByRole("status")).toHaveTextContent(/preparing invoice preview/i);
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send to customer/i })).toBeDisabled();
  });

  it("shows load errors and PDF generation errors gracefully", () => {
    const { unmount } = render(
      <InvoicePreviewModal isOpen data={null} loadError="Couldn't load your business details" onEdit={vi.fn()} onSend={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your business details");
    unmount();

    buildInvoicePdfMock.mockImplementation(() => {
      throw new Error("out of memory");
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(toastError).toHaveBeenCalledWith("Couldn't generate the PDF: out of memory");
  });

  it("contains rendering errors in an error boundary", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...data, lineItems: null as unknown as InvoicePreviewData["lineItems"] };
    renderModal({ data: broken });
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't render the invoice preview/i);
    // The action bar is still usable.
    expect(screen.getByRole("button", { name: /edit details/i })).toBeEnabled();
    consoleError.mockRestore();
  });
});
