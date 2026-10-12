import {
  HORIZON_POLLER_EVENTS,
  horizonPoller,
} from "../horizonPoller.service";

const ADDRESS = "GTEST_HORIZON_POLLER_ADDRESS";
const ISSUER =
  process.env.USDC_ISSUER_PUBLIC_KEY ||
  "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";

function paymentRecord(pagingToken: string, transactionHash: string) {
  return {
    paging_token: pagingToken,
    type: "payment",
    asset_code: "USDC",
    asset_issuer: ISSUER,
    to: ADDRESS,
    from: "GTEST_PAYER",
    amount: "10.00",
    transaction_hash: transactionHash,
  };
}

function mockPaymentsQuery(call: jest.Mock) {
  const query: any = {
    forAccount: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    cursor: jest.fn(),
    call,
  };
  query.forAccount.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.cursor.mockReturnValue(query);

  const poller = horizonPoller as any;
  const originalServer = poller.server;
  poller.server = { payments: () => query };

  return {
    query,
    restore: () => {
      poller.server = originalServer;
    },
  };
}

describe("HorizonPollerService paging cursor", () => {
  afterEach(() => {
    horizonPoller.unwatchAddress(ADDRESS);
  });

  it("advances to the newest token and emits only payments returned after that cursor", async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce({
        records: [
          paymentRecord("1002", "tx_newest"),
          paymentRecord("1001", "tx_older"),
        ],
      })
      .mockResolvedValueOnce({
        records: [paymentRecord("1003", "tx_next")],
      });
    const { query, restore } = mockPaymentsQuery(call);
    const detected: string[] = [];
    const listener = (event: { transactionHash: string }) => {
      detected.push(event.transactionHash);
    };

    horizonPoller.watchAddress(ADDRESS);
    horizonPoller.on(HORIZON_POLLER_EVENTS.PAYMENT_DETECTED, listener);

    try {
      await (horizonPoller as any).tick();
      expect(query.cursor).not.toHaveBeenCalled();
      await (horizonPoller as any).tick();

      expect(query.cursor).toHaveBeenCalledTimes(1);
      expect(query.cursor).toHaveBeenCalledWith("1002");
      expect(detected).toEqual(["tx_newest", "tx_older", "tx_next"]);
      expect(new Set(detected).size).toBe(detected.length);
    } finally {
      horizonPoller.removeListener(
        HORIZON_POLLER_EVENTS.PAYMENT_DETECTED,
        listener,
      );
      horizonPoller.unwatchAddress(ADDRESS);
      restore();
    }
  });

  it("clears the stored paging token when an address is unwatched", async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce({ records: [paymentRecord("2001", "tx_first")] })
      .mockResolvedValueOnce({ records: [] });
    const { query, restore } = mockPaymentsQuery(call);

    horizonPoller.watchAddress(ADDRESS);

    try {
      await (horizonPoller as any).tick();
      expect((horizonPoller as any).lastPagingTokenByAddress.get(ADDRESS)).toBe(
        "2001",
      );

      horizonPoller.unwatchAddress(ADDRESS);
      expect(
        (horizonPoller as any).lastPagingTokenByAddress.has(ADDRESS),
      ).toBe(false);

      horizonPoller.watchAddress(ADDRESS);
      await (horizonPoller as any).tick();
      expect(query.cursor).not.toHaveBeenCalled();
    } finally {
      horizonPoller.unwatchAddress(ADDRESS);
      restore();
    }
  });
});