import { getDashboardFxRates } from '../dashboardFx.service';

describe('getDashboardFxRates', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns 24-hour history and deltas for the supported dashboard pairs', async () => {
    const now = Date.now();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prices: [
          [now - 24 * 60 * 60 * 1000, 1],
          [now, 1.1],
        ],
      }),
    }) as jest.Mock;

    const rates = await getDashboardFxRates(true);

    expect(rates.map(({ pair }) => pair)).toEqual(['XLM/USD', 'USDC/NGN', 'EURC/USD']);
    expect(rates[0]).toMatchObject({
      rate: 1.1,
      change24h: expect.closeTo(10),
      points: [
        { rate: 1 },
        { rate: 1.1 },
      ],
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns an unavailable state for an individual pair without failing the other quotes', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ prices: [[Date.now(), 1]] }),
      }) as jest.Mock;

    const rates = await getDashboardFxRates(true);

    expect(rates[0]).toMatchObject({
      pair: 'XLM/USD',
      rate: null,
      change24h: null,
      error: 'Rate history is temporarily unavailable',
    });
    expect(rates[1].rate).toBe(1);
    expect(rates[2].rate).toBe(1);
  });
});