const prismaMock = {
  payment: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => prismaMock),
}));

jest.mock("../../config/prisma", () => ({ prisma: prismaMock }));

jest.mock("../../helpers/request.helper", () => ({
  validateUserId: jest.fn(async (req: { merchantId?: string; user?: { id?: string } }) => {
    const merchantId = req?.merchantId || req?.user?.id;
    if (!merchantId) {
      throw { status: 401, code: "UNAUTHORIZED", message: "Unauthorized" };
    }
    return merchantId;
  }),
}));

import { exportPayments } from "../payment.controller";
import { PAYMENT_CSV_COLUMNS } from "../../services/paymentCsvExport.service";

/** Minimal Express response that also satisfies the CSV stream sink contract. */
function buildRes() {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let ended = false;

  const res: any = {
    headers,
    chunks,
    headersSent: false,
    destroyed: false,
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    attachment: jest.fn((filename: string) => {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
      return res;
    }),
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    send: jest.fn(() => res),
    end: jest.fn(() => {
      ended = true;
      res.headersSent = true;
      return res;
    }),
    write: jest.fn((chunk: string) => {
      res.headersSent = true;
      chunks.push(chunk);
      return true;
    }),
    once: jest.fn(),
    off: jest.fn(),
    removeListener: jest.fn(),
    get ended() {
      return ended;
    },
    get csv() {
      return chunks.join("");
    },
  };

  return res;
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay_1",
    merchantId: "merch_1",
    status: "confirmed",
    amount: { toString: () => "125.500000" },
    currency: "USDC",
    paid_amount: { toString: () => "125.500000" },
    usdc_amount: null,
    fx_rate: null,
    customerId: null,
    customer_email: "buyer@example.com",
    customer: null,
    description: null,
    note: null,
    metadata: {},
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    confirmed_at: null,
    settled_at: null,
    expiration: new Date("2026-03-02T10:00:00.000Z"),
    transaction_hash: "tx_1",
    contract_tx_hash: null,
    sweep_tx_hash: null,
    payer_address: null,
    stellar_address: null,
    payment_index: null,
    onchain_verified: null,
    checkout_url: "https://pay.example.com/pay_1",
    success_url: null,
    cancel_url: null,
    paymentLinkId: null,
    settlementId: null,
    settlement_ref: null,
    settlement_fiat_amount: null,
    settlement_fiat_currency: null,
    swept: false,
    settled: false,
    swept_at: null,
    webhook_status: "PENDING",
    webhook_retries: 0,
    is_test_mode: false,
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.payment.count.mockReset().mockResolvedValue(0);
  prismaMock.payment.findMany.mockReset().mockResolvedValue([]);
});

describe("exportPayments controller — CSV download (#1216)", () => {
  it("returns 401 when the request carries no merchant", async () => {
    const res = buildRes();
    await exportPayments({ query: {} } as any, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });

  it("sends a CSV attachment with the full column set as the header", async () => {
    prismaMock.payment.count.mockResolvedValue(1);
    prismaMock.payment.findMany.mockResolvedValue([makePayment()]);

    const res = buildRes();
    await exportPayments({ merchantId: "merch_1", query: {} } as any, res);

    expect(headersOf(res)["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(headersOf(res)["Content-Disposition"]).toMatch(
      /^attachment; filename="transactions_\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.csv.split("\r\n")[0]).toBe(PAYMENT_CSV_COLUMNS.join(","));
    expect(res.end).toHaveBeenCalled();
  });

  it("streams instead of buffering the whole result set in one send", async () => {
    prismaMock.payment.count.mockResolvedValue(1);
    prismaMock.payment.findMany.mockResolvedValue([makePayment()]);

    const res = buildRes();
    await exportPayments({ merchantId: "merch_1", query: {} } as any, res);

    expect(res.write).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("scopes the export to the authenticated merchant", async () => {
    await exportPayments({ merchantId: "merch_1", query: {} } as any, buildRes());

    expect(prismaMock.payment.count.mock.calls[0][0].where.merchantId).toBe("merch_1");
  });

  it("keeps live and test payments in separate partitions for API keys", async () => {
    await exportPayments(
      { merchantId: "merch_1", isTestMode: true, query: {} } as any,
      buildRes(),
    );

    expect(prismaMock.payment.count.mock.calls[0][0].where.is_test_mode).toBe(true);
  });

  it("applies the date range params, with date_to covering the whole day", async () => {
    await exportPayments(
      {
        merchantId: "merch_1",
        query: { date_from: "2026-03-01", date_to: "2026-03-04" },
      } as any,
      buildRes(),
    );

    expect(prismaMock.payment.count.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date("2026-03-01T00:00:00.000Z"),
      lte: new Date("2026-03-04T23:59:59.999Z"),
    });
  });

  it("forwards the status, currency, search and amount filters", async () => {
    await exportPayments(
      {
        merchantId: "merch_1",
        query: {
          status: "completed",
          currency: "USDC",
          search: "buyer",
          amount_min: "10",
          amount_max: "500",
        },
      } as any,
      buildRes(),
    );

    const { where } = prismaMock.payment.count.mock.calls[0][0];
    expect(where.status).toBe("completed");
    expect(where.currency).toBe("USDC");
    expect(where.amount).toEqual({ gte: 10, lte: 500 });
    expect(where.OR).toHaveLength(2);
  });

  it("rejects an unparseable date range with a 400 before touching the database", async () => {
    const res = buildRes();
    await exportPayments(
      { merchantId: "merch_1", query: { date_from: "yesterday" } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(prismaMock.payment.count).not.toHaveBeenCalled();
  });

  it("rejects an inverted date range with a 400", async () => {
    const res = buildRes();
    await exportPayments(
      {
        merchantId: "merch_1",
        query: { date_from: "2026-03-10", date_to: "2026-03-01" },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prismaMock.payment.count).not.toHaveBeenCalled();
  });

  it("returns a 500 JSON error when the failure happens before any bytes are sent", async () => {
    prismaMock.payment.count.mockRejectedValue(new Error("db down"));

    const res = buildRes();
    await exportPayments({ merchantId: "merch_1", query: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INTERNAL_ERROR" }),
    );
  });

  it("closes the response instead of padding the CSV when a mid-stream query fails", async () => {
    // Fill the first batch so the exporter asks for a second page, then fail it.
    prismaMock.payment.count.mockResolvedValue(1000);
    prismaMock.payment.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 500 }, (_unused, i) => makePayment({ id: `pay_${i}` })),
      )
      .mockRejectedValueOnce(new Error("db down"));

    const res = buildRes();
    await exportPayments({ merchantId: "merch_1", query: {} } as any, res);

    expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(2);
    expect(res.end).toHaveBeenCalled();
    // Headers are already on the wire, so no JSON error body is appended.
    expect(res.json).not.toHaveBeenCalled();
  });
});

function headersOf(res: ReturnType<typeof buildRes>) {
  return res.headers as Record<string, string>;
}
