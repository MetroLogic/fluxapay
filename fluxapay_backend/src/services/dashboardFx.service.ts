export interface DashboardFxPoint {
  timestamp: string;
  rate: number;
}

export interface DashboardFxRate {
  pair: 'XLM/USD' | 'USDC/NGN' | 'EURC/USD';
  rate: number | null;
  change24h: number | null;
  updatedAt: string;
  points: DashboardFxPoint[];
  error?: string;
}

const MARKET_API_BASE = process.env.COINGECKO_API_BASE_URL ?? 'https://api.coingecko.com/api/v3';
const CACHE_TTL_MS = 60_000;
const PAIRS = [
  { pair: 'XLM/USD', coin: 'stellar', currency: 'usd' },
  { pair: 'USDC/NGN', coin: 'usd-coin', currency: 'ngn' },
  { pair: 'EURC/USD', coin: 'euro-coin', currency: 'usd' },
] as const;

let cachedRates: DashboardFxRate[] | undefined;
let cachedAt = 0;

async function fetchRateHistory(
  pair: typeof PAIRS[number],
): Promise<DashboardFxRate> {
  const url = new URL(`${MARKET_API_BASE}/coins/${pair.coin}/market_chart`);
  url.searchParams.set('vs_currency', pair.currency);
  url.searchParams.set('days', '1');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Market data provider responded with ${response.status}`);
  }

  const payload = await response.json() as { prices?: [number, number][] };
  const prices = (payload.prices ?? []).filter(
    (entry): entry is [number, number] =>
      Array.isArray(entry) && Number.isFinite(entry[0]) && Number.isFinite(entry[1]) && entry[1] > 0,
  );

  if (prices.length === 0) {
    throw new Error('Market data provider returned no valid price history');
  }

  const first = prices[0];
  const last = prices[prices.length - 1];
  const points = prices.map(([timestamp, rate]) => ({
    timestamp: new Date(timestamp).toISOString(),
    rate,
  }));

  return {
    pair: pair.pair,
    rate: last[1],
    change24h: ((last[1] - first[1]) / first[1]) * 100,
    updatedAt: new Date(last[0]).toISOString(),
    points,
  };
}

export async function getDashboardFxRates(forceRefresh = false): Promise<DashboardFxRate[]> {
  if (!forceRefresh && cachedRates && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRates;
  }

  const rates = await Promise.all(PAIRS.map(async (pair): Promise<DashboardFxRate> => {
    try {
      return await fetchRateHistory(pair);
    } catch {
      return {
        pair: pair.pair,
        rate: null,
        change24h: null,
        updatedAt: new Date().toISOString(),
        points: [],
        error: 'Rate history is temporarily unavailable',
      };
    }
  }));

  cachedRates = rates;
  cachedAt = Date.now();
  return rates;
}