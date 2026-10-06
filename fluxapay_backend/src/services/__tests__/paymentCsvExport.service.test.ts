const prismaMock = {
  payment: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => prismaMock),
}));

jest.mock("../../config/prisma", () => ({
  prisma: prismaMock,
}));

import {
  buildPaymentExportFilename,
  buildPaymentExportWhere,
  escapeCsvCell,
  ExportClientDisconnectedError,
  InvalidExportDateError,
  parseAmountBound,
  parseExportDateBound,
  paymentToCsvCells,
  PAYMENT_CSV_COLUMNS,
  PAYMENT_CSV_MAX_ROWS,
  streamPaymentsCsv,
  toCsvRecord,
  type CsvStreamSink,
  type PaymentExportRow,
} from "../paymentCsvExport.service";

/** Collects everything written so assertions can look at the finished CSV. */
function createSink() {
  const chunks: string[] = [];
  let ended = false;

  // write() never reports backpressure here, so the event hooks are inert.
  const sink: CsvStreamSink & { chunks: string[]; csv: () => string; ended: () => boolean } = {
    chunks,
    csv: () => chunks.join(""),
    ended: () => ended,
    destroyed: false,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    once: () => undefined,
    off: () => undefined,
    removeListener: () => undefined,
    end: () => {
      ended = true;
    },
  };

  return sink;
}

/** A sink whose write() always reports backpressure, forcing a drain wait. */
function createBackpressuredSink() {
  const chunks: string[] = [];
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  let ended = false;

  const emit = (event: string) => {
    const list = listeners.get(event);
    listeners.delete(event);
    list?.forEach((l) => l());
  };

  const sink = {
    chunks,
    destroyed: false,
    write: (chunk: string) => {
      chunks.push(chunk);
      // Simulate a slow client: report backpressure, then drain on the next tick.
      setImmediate(() => emit("drain"));
      return false;
    },
    once: (event: string, listener: (...args: unknown[]) => void) => {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((l) => l !== listener),
      );
    },
    removeListener: () => undefined,
    end: () => {
      ended = true;
    },
    emit,
    get ended() {
      return ended;
    },
  } as unknown as CsvStreamSink & { chunks: string[]; emit: (e: string) => void };

  return sink;
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
    customerId: "cust_1",
    customer_email: "buyer@example.com",
    customer: { id: "cust_1", name: "Ada Buyer", phone: null, stellar_address: null },
    description: "Order 42",
    note: null,
    metadata: { order_id: "42" },
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    confirmed_at: new Date("2026-03-01T10:05:00.000Z"),
    settled_at: null,
    expiration: new Date("2026-03-02T10:00:00.000Z"),
    transaction_hash: "abc123",
    contract_tx_hash: null,
    sweep_tx_hash: null,
    payer_address: "GPAYER",
    stellar_address: null,
    payment_index: 7,
    onchain_verified: true,
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
    webhook_status: "DELIVERED",
    webhook_retries: 0,
    is_test_mode: false,
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.payment.count.mockReset();
  prismaMock.payment.findMany.mockReset();
  prismaMock.payment.count.mockResolvedValue(0);
  prismaMock.payment.findMany.mockResolvedValue([]);
});

describe("escapeCsvCell", () => {
  it("returns an empty string for null and undefined", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell("")).toBe("");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    expect(escapeCsvCell("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
  });

  it("leaves numeric values untouched so precision and sign survive", () => {
    expect(escapeCsvCell("-125.50")).toBe("-125.50");
    expect(escapeCsvCell({ toString: () => "0.00000001" })).toBe("0.00000001");
  });

  it("serialises dates as ISO strings", () => {
    expect(escapeCsvCell(new Date("2026-03-01T10:00:00.000Z"))).toBe(
      "2026-03-01T10:00:00.000Z",
    );
  });
});

describe("toCsvRecord", () => {
  it("terminates each record with CRLF", () => {
    expect(toCsvRecord(["a", "b"])).toBe("a,b\r\n");
  });
});

describe("parseExportDateBound", () => {
  it("returns undefined for empty input", () => {
    expect(parseExportDateBound(undefined, "from")).toBeUndefined();
    expect(parseExportDateBound("", "to")).toBeUndefined();
    expect(parseExportDateBound("   ", "to")).toBeUndefined();
  });

  it("anchors a bare date_to to the end of that day", () => {
    const parsed = parseExportDateBound("2026-03-04", "to");
    expect(parsed?.toISOString()).toBe("2026-03-04T23:59:59.999Z");
  });

  it("anchors a bare date_from to the start of that day", () => {
    const parsed = parseExportDateBound("2026-03-04", "from");
    expect(parsed?.toISOString()).toBe("2026-03-04T00:00:00.000Z");
  });

  it("passes through full ISO date-times unchanged", () => {
    const parsed = parseExportDateBound("2026-03-04T12:30:00.000Z", "to");
    expect(parsed?.toISOString()).toBe("2026-03-04T12:30:00.000Z");
  });

  it("throws on unparseable values instead of producing Invalid Date", () => {
    expect(() => parseExportDateBound("not-a-date", "from")).toThrow(
      InvalidExportDateError,
    );
  });
});

describe("parseAmountBound", () => {
  it("parses numeric strings and ignores garbage", () => {
    expect(parseAmountBound("10.5")).toBe(10.5);
    expect(parseAmountBound(0)).toBe(0);
    expect(parseAmountBound("abc")).toBeUndefined();
    expect(parseAmountBound(undefined)).toBeUndefined();
  });
});

describe("buildPaymentExportWhere", () => {
  it("scopes the query to the merchant", () => {
    const where = buildPaymentExportWhere({ merchantId: "merch_1" });
    expect(where.merchantId).toBe("merch_1");
    expect(where.createdAt).toBeUndefined();
  });

  it("partitions live and test mode only when the key type is known", () => {
    expect(
      buildPaymentExportWhere({ merchantId: "m", isTestMode: false }).is_test_mode,
    ).toBe(false);
    expect(
      buildPaymentExportWhere({ merchantId: "m", isTestMode: true }).is_test_mode,
    ).toBe(true);
    expect(
      buildPaymentExportWhere({ merchantId: "m" }).is_test_mode,
    ).toBeUndefined();
  });

  it("builds an inclusive createdAt range", () => {
    const where = buildPaymentExportWhere({
      merchantId: "m",
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-04T23:59:59.999Z"),
    });
    expect(where.createdAt).toEqual({
      gte: new Date("2026-03-01T00:00:00.000Z"),
      lte: new Date("2026-03-04T23:59:59.999Z"),
    });
  });

  it("restricts search to the id and customer email columns", () => {
    const where = buildPaymentExportWhere({ merchantId: "m", search: "abc" });
    expect(where.OR).toEqual([
      { id: { contains: "abc" } },
      { customer_email: { contains: "abc", mode: "insensitive" } },
    ]);
  });

  it("supports amount bounds", () => {
    const where = buildPaymentExportWhere({ merchantId: "m", amountMin: 5, amountMax: 10 });
    expect(where.amount).toEqual({ gte: 5, lte: 10 });
  });
});

describe("buildPaymentExportFilename", () => {
  it("uses a dated, dated-slugged csv name", () => {
    expect(buildPaymentExportFilename(new Date("2026-03-04T09:00:00.000Z"))).toBe(
      "transactions_2026-03-04.csv",
    );
  });
});

describe("paymentToCsvCells", () => {
  it("emits one cell per declared column, in order", () => {
    const cells = paymentToCsvCells(makePayment() as unknown as PaymentExportRow);
    expect(cells).toHaveLength(PAYMENT_CSV_COLUMNS.length);
  });

  it("includes transaction, amount, status, currency, timestamp and customer info", () => {
    const cells = paymentToCsvCells(makePayment() as unknown as PaymentExportRow);
    const at = (column: string) => cells[PAYMENT_CSV_COLUMNS.indexOf(column as never)];

    expect(at("payment_id")).toBe("pay_1");
    expect(at("status")).toBe("confirmed");
    expect(at("amount")).toBe("125.500000");
    expect(at("currency")).toBe("USDC");
    expect(at("created_at")).toBe("2026-03-01T10:00:00.000Z");
    expect(at("customer_email")).toBe("buyer@example.com");
    expect(at("customer_name")).toBe("Ada Buyer");
    expect(at("transaction_hash")).toBe("abc123");
  });

  it("serialises metadata as JSON and renders nulls as empty cells", () => {
    const cells = paymentToCsvCells(makePayment({ note: null }) as unknown as PaymentExportRow);
    const at = (column: string) => cells[PAYMENT_CSV_COLUMNS.indexOf(column as never)];

    expect(at("metadata")).toBe('"{""order_id"":""42""}"');
    expect(at("note")).toBe("");
    expect(at("settled_at")).toBe("");
  });
});

describe("streamPaymentsCsv", () => {
  it("writes the header even when nothing matches", async () => {
    const sink = createSink();
    const result = await streamPaymentsCsv({
      filters: { merchantId: "merch_1" },
      sink,
    });

    expect(sink.csv()).toBe(`${PAYMENT_CSV_COLUMNS.join(",")}\r\n`);
    expect(result).toEqual({ rowCount: 0, totalMatched: 0, truncated: false });
    expect(sink.ended()).toBe(true);
  });

  it("streams rows in chronological order and reports the row count", async () => {
    prismaMock.payment.count.mockResolvedValue(2);
    prismaMock.payment.findMany.mockResolvedValue([
      makePayment({ id: "pay_1" }),
      makePayment({ id: "pay_2" }),
    ]);

    const sink = createSink();
    const result = await streamPaymentsCsv({
      filters: { merchantId: "merch_1" },
      sink,
      batchSize: 500,
    });

    expect(result.rowCount).toBe(2);
    expect(result.totalMatched).toBe(2);
    expect(result.truncated).toBe(false);
    expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.payment.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
    const lines = sink.csv().trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("pay_1");
    expect(lines[2]).toContain("pay_2");
  });

  it("pages with a keyset window instead of growing the result set in memory", async () => {
    const first = makePayment({ id: "pay_1", createdAt: new Date("2026-03-01T10:00:00.000Z") });
    const second = makePayment({ id: "pay_2", createdAt: new Date("2026-03-02T10:00:00.000Z") });
    const third = makePayment({ id: "pay_3", createdAt: new Date("2026-03-03T10:00:00.000Z") });
    prismaMock.payment.count.mockResolvedValue(3);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([second, third]);

    const sink = createSink();
    const result = await streamPaymentsCsv({
      filters: { merchantId: "merch_1" },
      sink,
      batchSize: 1,
    });

    expect(result.rowCount).toBe(3);
    expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(2);

    // The first page uses the filter unchanged...
    expect(prismaMock.payment.findMany.mock.calls[0][0].where).toEqual({
      merchantId: "merch_1",
    });
    expect(prismaMock.payment.findMany.mock.calls[0][0]).not.toHaveProperty("skip");

    // ...and later pages restrict the window to rows after the last one written.
    const [clause, keyset] = prismaMock.payment.findMany.mock.calls[1][0].where.AND;
    expect(clause).toEqual({ merchantId: "merch_1" });
    expect(keyset).toEqual({
      OR: [
        { createdAt: { gt: new Date("2026-03-01T10:00:00.000Z") } },
        { createdAt: new Date("2026-03-01T10:00:00.000Z"), id: { gt: "pay_1" } },
      ],
    });

    const lines = sink.csv().trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("pay_1");
    expect(lines[3]).toContain("pay_3");
  });

  it("stops paging when a short batch signals the end of the result set", async () => {
    prismaMock.payment.count.mockResolvedValue(1);
    prismaMock.payment.findMany.mockResolvedValue([makePayment({ id: "pay_1" })]);

    const sink = createSink();
    const result = await streamPaymentsCsv({
      filters: { merchantId: "merch_1" },
      sink,
      batchSize: 100,
    });

    expect(result.rowCount).toBe(1);
    expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(1);
  });

  it("caps the export at the row limit and flags it as truncated", async () => {
    prismaMock.payment.count.mockResolvedValue(PAYMENT_CSV_MAX_ROWS + 500);
    prismaMock.payment.findMany.mockImplementation(async ({ take }: { take: number }) =>
      Array.from({ length: take }, (_unused, i) => makePayment({ id: `pay_${i}` })),
    );

    const sink = createSink();
    const result = await streamPaymentsCsv({
      filters: { merchantId: "merch_1" },
      sink,
      batchSize: 100,
    });

    expect(result.rowCount).toBe(PAYMENT_CSV_MAX_ROWS);
    expect(result.truncated).toBe(true);
  });

  it("waits for drain instead of buffering when the client is slow", async () => {
    prismaMock.payment.count.mockResolvedValue(1);
    prismaMock.payment.findMany.mockResolvedValue([makePayment({ id: "pay_1" })]);

    const sink = createBackpressuredSink();
    const result = await streamPaymentsCsv({
      filters: { merchantId: "merch_1" },
      sink,
      batchSize: 100,
    });

    expect(result.rowCount).toBe(1);
    expect(sink.ended).toBe(true);
  });

  it("aborts when the client disconnects mid-export", async () => {
    prismaMock.payment.count.mockResolvedValue(1);
    prismaMock.payment.findMany.mockResolvedValue([makePayment({ id: "pay_1" })]);

    const chunks: string[] = [];
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    const sink: CsvStreamSink = {
      destroyed: false,
      write: (chunk: string) => {
        chunks.push(chunk);
        // Report backpressure, then announce the disconnect instead of a drain.
        setImmediate(() => {
          const list = listeners.get("close");
          listeners.delete("close");
          list?.forEach((l) => l());
        });
        return false;
      },
      once: (event, listener) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      off: (event, listener) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((l) => l !== listener),
        );
      },
      removeListener: () => undefined,
      end: () => undefined,
    };

    await expect(
      streamPaymentsCsv({ filters: { merchantId: "merch_1" }, sink, batchSize: 100 }),
    ).rejects.toBeInstanceOf(ExportClientDisconnectedError);
  });
});
