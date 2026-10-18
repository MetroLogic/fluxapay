import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import type { Payment } from "../types";
import { RefundModal } from "../RefundModal";

vi.mock("@/lib/api", () => ({
  api: {
    refunds: {
      list: vi.fn(),
      initiate: vi.fn(),
    },
  },
}));

describe("RefundModal", () => {
  const payment: Payment = {
    id: "pay_123",
    amount: 100,
    currency: "USDC",
    status: "confirmed",
    merchantId: "merchant_123",
    customerName: "Test Customer",
    customerEmail: "customer@example.com",
    customerAddress: "GTEST",
    orderId: "order_123",
    createdAt: "2026-01-01T00:00:00.000Z",
    depositAddress: "",
  };
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.refunds.list).mockResolvedValue({
      data: {
        data: {
          refunds: [
            { paymentId: "pay_123", amount: "20", status: "completed" },
            { paymentId: "pay_123", amount: "5", status: "processing" },
            { paymentId: "pay_123", amount: "100", status: "failed" },
          ],
          pagination: { total_pages: 1 },
        },
      },
    });
    vi.mocked(api.refunds.initiate).mockResolvedValue({ data: {} });
  });

  it("shows the payment/refund summary and defaults to the remaining balance", async () => {
    render(
      <RefundModal
        isOpen
        payment={payment}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    expect(await screen.findByText("25 USDC")).toBeInTheDocument();
    expect(screen.getByText("75 USDC")).toBeInTheDocument();
    expect(screen.getByLabelText(/Refund amount/)).toHaveValue(75);
  });

  it("prevents amounts exceeding the remaining balance", async () => {
    render(
      <RefundModal
        isOpen
        payment={payment}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const amountInput = await screen.findByLabelText(/Refund amount/);
    fireEvent.change(amountInput, { target: { value: "76" } });
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "customer_request" },
    });

    expect(
      screen.getByText(/no more than 75 USDC/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Refund" })).toBeDisabled();
    expect(api.refunds.initiate).not.toHaveBeenCalled();
  });

  it("requires a reason and dispatches a valid refund", async () => {
    render(
      <RefundModal
        isOpen
        payment={payment}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const submit = await screen.findByRole("button", { name: "Confirm Refund" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "customer_request" },
    });
    fireEvent.click(submit);

    await waitFor(() => expect(api.refunds.initiate).toHaveBeenCalledWith({
      paymentId: "pay_123",
      merchantId: "merchant_123",
      amount: 75,
      currency: "USDC",
      customerAddress: "GTEST",
      reason: "customer_request",
    }));
    expect(onSuccess).toHaveBeenCalledWith("refunded");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a loading state while the refund request is processing", async () => {
    let resolveRefund!: (value: { data: unknown }) => void;
    vi.mocked(api.refunds.initiate).mockImplementation(
      () =>
        new Promise<{ data: unknown }>((resolve) => {
          resolveRefund = resolve;
        }),
    );
    render(
      <RefundModal
        isOpen
        payment={payment}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    await screen.findByLabelText(/Refund amount/);
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "customer_request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Refund" }));

    expect(await screen.findByRole("button", { name: "Processing..." })).toBeDisabled();
    resolveRefund({ data: {} });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("surfaces API errors without reporting a successful refund", async () => {
    vi.mocked(api.refunds.initiate).mockResolvedValue({
      error: new ApiError(422, "Refund exceeds the available balance."),
    });
    render(
      <RefundModal
        isOpen
        payment={payment}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    await screen.findByLabelText(/Refund amount/);
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "customer_request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Refund" }));

    expect(
      await screen.findByText("Refund exceeds the available balance."),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
