/**
 * Unit tests for emailNotification.service.ts (#1190)
 *
 * This is the handler that emails a merchant when a payment is confirmed. It was
 * written before the issue was filed but was unreachable in practice, because
 * Merchant.notify_on_payment defaulted to false and nothing ever wrote it, so the
 * handler returned early for every merchant.
 *
 * Validates that:
 *  1. The listener is registered against AppEvents.PAYMENT_CONFIRMED.
 *  2. A confirmation email is sent when both merchant flags allow it.
 *  3. Either flag suppressing the merchant skips the send — this is the branch
 *     that silently swallowed every email before the default was flipped.
 *  4. The correct payload (amount, currency, id, reference) is passed through.
 *  5. The explorer link targets testnet or public based on the configured network.
 *  6. A missing merchant, or a failing provider, never rejects — the listener
 *     runs on the payment write path and must not break payment processing.
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockMerchantFindUnique = jest.fn();

jest.mock("../../config/prisma", () => ({
  prisma: {
    merchant: { findUnique: (...args: unknown[]) => mockMerchantFindUnique(...args) },
  },
}));

jest.mock("../../services/email.service", () => ({
  sendPaymentConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

// Capture the handler so the listener can be driven directly. Using a jest.fn()
// rather than a real EventEmitter keeps these tests to the handler's own logic.
const mockEventOn = jest.fn();

jest.mock("../../services/EventService", () => ({
  AppEvents: {
    PAYMENT_CONFIRMED: "payment.confirmed",
    PAYMENT_UPDATED: "payment.updated",
    PAYMENT_EXPIRED: "payment.expired",
    PAYMENT_PARTIALLY_PAID: "payment.partially_paid",
    PAYMENT_OVERPAID: "payment.overpaid",
  },
  eventBus: { on: (...args: unknown[]) => mockEventOn(...args) },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { initializeEmailNotifications } from "../../services/emailNotification.service";
import { sendPaymentConfirmationEmail } from "../../services/email.service";
import { AppEvents } from "../../services/EventService";

// ── Helpers ───────────────────────────────────────────────────────────────────

type PaymentHandler = (payment: Record<string, unknown>) => Promise<void>;

/** Build a payment shaped like the row paymentOracle.service.ts emits. */
function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay_123",
    merchantId: "merch_1",
    amount: "25.0000000",
    currency: "USDC",
    transaction_hash: "tx_hash_abc",
    merchant_reference: "order-42",
    stellar_address: "GABC",
    updated_at: new Date("2026-09-29T12:00:00.000Z"),
    created_at: new Date("2026-09-29T11:00:00.000Z"),
    ...overrides,
  };
}

/** Opt-in merchant — both flags true. */
function optedInMerchant(overrides: Record<string, unknown> = {}) {
  return {
    email: "merchant@example.com",
    business_name: "Acme Trading",
    email_notifications_enabled: true,
    notify_on_payment: true,
    ...overrides,
  };
}

const sendMock = sendPaymentConfirmationEmail as jest.Mock;

/** Register the listener and return the captured handler. */
function registerHandler(): PaymentHandler {
  initializeEmailNotifications();
  const call = mockEventOn.mock.calls.find(
    ([event]) => event === AppEvents.PAYMENT_CONFIRMED,
  );
  if (!call) throw new Error("handler was not registered for PAYMENT_CONFIRMED");
  return call[1] as PaymentHandler;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMerchantFindUnique.mockResolvedValue(optedInMerchant());
  delete process.env.STELLAR_NETWORK_PASSPHRASE;
  delete process.env.STELLAR_HORIZON_URL;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("initializeEmailNotifications", () => {
  it("subscribes a handler to AppEvents.PAYMENT_CONFIRMED", () => {
    initializeEmailNotifications();

    expect(mockEventOn).toHaveBeenCalledWith(
      AppEvents.PAYMENT_CONFIRMED,
      expect.any(Function),
    );
  });

  it("does not subscribe to unrelated events", () => {
    initializeEmailNotifications();

    const events = mockEventOn.mock.calls.map(([event]) => event);
    expect(events).toEqual([AppEvents.PAYMENT_CONFIRMED]);
  });
});

describe("handlePaymentConfirmed", () => {
  it("sends a confirmation email when the merchant is opted in", async () => {
    const handler = registerHandler();

    await handler(makePayment());

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      "merchant@example.com",
      "Acme Trading",
      expect.objectContaining({
        amount: "25.0000000",
        currency: "USDC",
        payment_id: "pay_123",
        merchant_reference: "order-42",
      }),
    );
  });

  it("skips the email when the merchant has turned off all email notifications", async () => {
    mockMerchantFindUnique.mockResolvedValue(
      optedInMerchant({ email_notifications_enabled: false }),
    );
    const handler = registerHandler();

    await handler(makePayment());

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips the email when notify_on_payment is off", async () => {
    // This is the branch that hid the feature before #1190 flipped the default.
    mockMerchantFindUnique.mockResolvedValue(optedInMerchant({ notify_on_payment: false }));
    const handler = registerHandler();

    await handler(makePayment());

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips the email when the merchant row no longer exists", async () => {
    mockMerchantFindUnique.mockResolvedValue(null);
    const handler = registerHandler();

    await handler(makePayment());

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("looks the merchant up by the payment's merchantId", async () => {
    const handler = registerHandler();

    await handler(makePayment({ merchantId: "merch_xyz" }));

    expect(mockMerchantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "merch_xyz" } }),
    );
  });

  it("omits merchant_reference when the payment has none", async () => {
    const handler = registerHandler();

    await handler(makePayment({ merchant_reference: null }));

    expect(sendMock).toHaveBeenCalledWith(
      "merchant@example.com",
      "Acme Trading",
      expect.objectContaining({ merchant_reference: undefined }),
    );
  });

  it("does not reject when the merchant lookup throws", async () => {
    mockMerchantFindUnique.mockRejectedValue(new Error("db down"));
    const handler = registerHandler();

    // The listener runs on the payment write path, so it must swallow failures.
    await expect(handler(makePayment())).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not reject when the email provider throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("resend 500"));
    const handler = registerHandler();

    await expect(handler(makePayment())).resolves.toBeUndefined();
  });
});

describe("explorer link", () => {
  it("links to the transaction on the public network by default", async () => {
    const handler = registerHandler();

    await handler(makePayment());

    expect(sendMock).toHaveBeenCalledWith(
      "merchant@example.com",
      "Acme Trading",
      expect.objectContaining({
        explorer_link: "https://stellar.expert/explorer/public/tx/tx_hash_abc",
      }),
    );
  });

  it("links to the testnet when the horizon URL is a testnet one", async () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
    const handler = registerHandler();

    await handler(makePayment());

    expect(sendMock).toHaveBeenCalledWith(
      "merchant@example.com",
      "Acme Trading",
      expect.objectContaining({
        explorer_link: "https://stellar.expert/explorer/testnet/tx/tx_hash_abc",
      }),
    );
  });

  it("treats the standard testnet passphrase as testnet via the horizon URL", async () => {
    // The passphrase alone is not a usable signal: the real testnet passphrase
    // is "Test SDF Network ; September 2015", which does not contain the
    // substring "Testnet" (#1190).
    process.env.STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
    process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
    const handler = registerHandler();

    await handler(makePayment());

    expect(sendMock).toHaveBeenCalledWith(
      "merchant@example.com",
      "Acme Trading",
      expect.objectContaining({
        explorer_link: "https://stellar.expert/explorer/testnet/tx/tx_hash_abc",
      }),
    );
  });

  it("falls back to the account link when there is no transaction hash", async () => {
    const handler = registerHandler();

    await handler(makePayment({ transaction_hash: null }));

    expect(sendMock).toHaveBeenCalledWith(
      "merchant@example.com",
      "Acme Trading",
      expect.objectContaining({
        explorer_link: "https://stellar.expert/explorer/public/account/GABC",
      }),
    );
  });
});
