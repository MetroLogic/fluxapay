/**
 * Unit tests for notificationPreferences.service.ts (#1190)
 *
 * `notify_on_payment` is stored on `Merchant`, not on
 * `MerchantNotificationPreferences`, because `emailNotification.service.ts`
 * reads it there when deciding whether to send a payment confirmation. It is
 * surfaced through this service so merchants have one endpoint for their
 * preferences rather than one field being stranded outside it.
 *
 * These tests pin that read/write split, and specifically that a merchant row
 * which cannot be found reads as opted *in* rather than silently opted out.
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockPrismaClient = {
  merchant: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  merchantNotificationPreferences: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../../services/notificationPreferences.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The shape merchantNotificationPreferences.upsert resolves with. */
function makePrefRow(overrides: Record<string, unknown> = {}) {
  return {
    merchantId: "merch_1",
    payment_expiry_reminder: true,
    sms_notifications_enabled: false,
    reminder_minutes_before: 5,
    created_at: new Date("2026-09-29T00:00:00.000Z"),
    updated_at: new Date("2026-09-29T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrismaClient.merchant.update.mockResolvedValue({ id: "merch_1" });
  mockPrismaClient.merchantNotificationPreferences.findUnique.mockResolvedValue(null);
  mockPrismaClient.merchantNotificationPreferences.upsert.mockResolvedValue(makePrefRow());
  // Default: merchant row exists and has payment emails switched on.
  mockPrismaClient.merchant.findUnique.mockResolvedValue({
    id: "merch_1",
    notify_on_payment: true,
    verified_phone: false,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getNotificationPreferences", () => {
  it("returns the stored row when one exists", async () => {
    mockPrismaClient.merchantNotificationPreferences.findUnique.mockResolvedValue(
      makePrefRow({ payment_expiry_reminder: false, reminder_minutes_before: 15 }),
    );

    const result = await getNotificationPreferences("merch_1");

    expect(result).toEqual({
      merchantId: "merch_1",
      payment_expiry_reminder: false,
      sms_notifications_enabled: false,
      reminder_minutes_before: 15,
      notify_on_payment: true,
    });
  });

  it("returns defaults without writing when no row exists", async () => {
    const result = await getNotificationPreferences("merch_1");

    expect(result).toEqual({
      merchantId: "merch_1",
      payment_expiry_reminder: true,
      sms_notifications_enabled: false,
      reminder_minutes_before: 5,
      notify_on_payment: true,
    });
    // A read must not create a row.
    expect(mockPrismaClient.merchantNotificationPreferences.upsert).not.toHaveBeenCalled();
  });

  it("reads notify_on_payment from the merchant row, not the preferences row", async () => {
    mockPrismaClient.merchant.findUnique.mockResolvedValue({
      id: "merch_1",
      notify_on_payment: false,
      verified_phone: false,
    });

    const result = await getNotificationPreferences("merch_1");

    expect(result.notify_on_payment).toBe(false);
    expect(mockPrismaClient.merchant.findUnique).toHaveBeenCalledWith({
      where: { id: "merch_1" },
      select: { notify_on_payment: true },
    });
  });

  it("treats a missing merchant row as opted in rather than opted out", async () => {
    // Guards against a lookup miss silently reading as "do not email": the
    // migration backfilled every existing merchant to true (#1190).
    mockPrismaClient.merchant.findUnique.mockResolvedValue(null);

    const result = await getNotificationPreferences("merch_ghost");

    expect(result.notify_on_payment).toBe(true);
  });
});

describe("updateNotificationPreferences", () => {
  it("writes notify_on_payment to the merchant row", async () => {
    // Only one merchant read happens on this path: the read-back after the
    // write, which is what the response reports.
    mockPrismaClient.merchant.findUnique.mockResolvedValue({
      id: "merch_1",
      notify_on_payment: false,
      verified_phone: false,
    });

    const result = await updateNotificationPreferences({
      merchantId: "merch_1",
      notify_on_payment: false,
    });

    expect(mockPrismaClient.merchant.update).toHaveBeenCalledWith({
      where: { id: "merch_1" },
      data: { notify_on_payment: false },
      select: { id: true },
    });
    // The response reflects what is stored, not what was requested.
    expect(result.notify_on_payment).toBe(false);
  });

  it("does not touch the merchant row when notify_on_payment is omitted", async () => {
    await updateNotificationPreferences({
      merchantId: "merch_1",
      payment_expiry_reminder: false,
    });

    expect(mockPrismaClient.merchant.update).not.toHaveBeenCalled();
  });

  it("does not persist notify_on_payment into the preferences row", async () => {
    await updateNotificationPreferences({
      merchantId: "merch_1",
      notify_on_payment: true,
    });

    const upsertArgs = mockPrismaClient.merchantNotificationPreferences.upsert.mock.calls[0][0];
    expect(upsertArgs.create).not.toHaveProperty("notify_on_payment");
    expect(upsertArgs.update).not.toHaveProperty("notify_on_payment");
  });

  it("still writes the other preferences normally when notify_on_payment is set", async () => {
    mockPrismaClient.merchant.findUnique.mockResolvedValue({
      id: "merch_1",
      notify_on_payment: true,
      verified_phone: false,
    });

    await updateNotificationPreferences({
      merchantId: "merch_1",
      notify_on_payment: true,
      payment_expiry_reminder: false,
      reminder_minutes_before: 30,
    });

    const upsertArgs = mockPrismaClient.merchantNotificationPreferences.upsert.mock.calls[0][0];
    expect(upsertArgs.create).toEqual({
      merchantId: "merch_1",
      payment_expiry_reminder: false,
      sms_notifications_enabled: false,
      reminder_minutes_before: 30,
    });
  });

  it("preserves existing values for fields that are not supplied", async () => {
    mockPrismaClient.merchantNotificationPreferences.findUnique.mockResolvedValue(
      makePrefRow({ reminder_minutes_before: 42 }),
    );
    mockPrismaClient.merchantNotificationPreferences.upsert.mockResolvedValue(
      makePrefRow({ reminder_minutes_before: 42, payment_expiry_reminder: false }),
    );
    mockPrismaClient.merchant.findUnique.mockResolvedValue({
      id: "merch_1",
      notify_on_payment: false,
      verified_phone: false,
    });

    await updateNotificationPreferences({
      merchantId: "merch_1",
      notify_on_payment: false,
    });

    const upsertArgs = mockPrismaClient.merchantNotificationPreferences.upsert.mock.calls[0][0];
    expect(upsertArgs.update.reminder_minutes_before).toBe(42);
  });

  it("rejects reminder_minutes_before below 1", async () => {
    await expect(
      updateNotificationPreferences({ merchantId: "merch_1", reminder_minutes_before: 0 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects enabling SMS without a verified phone", async () => {
    mockPrismaClient.merchant.findUnique.mockResolvedValue({
      id: "merch_1",
      notify_on_payment: true,
      verified_phone: false,
    });

    await expect(
      updateNotificationPreferences({ merchantId: "merch_1", sms_notifications_enabled: true }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
