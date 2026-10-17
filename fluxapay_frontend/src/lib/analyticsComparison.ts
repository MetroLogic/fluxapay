export interface PeriodRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

const DAY_MS = 86_400_000;

function parse(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}
function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inclusive day count of a range. */
export function rangeLengthDays(range: PeriodRange): number {
  return Math.round((parse(range.to) - parse(range.from)) / DAY_MS) + 1;
}

/**
 * Previous equivalent period: same inclusive length, ending the day before
 * `range.from` (no overlap, no gap).
 */
export function getPreviousPeriod(range: PeriodRange): PeriodRange {
  const len = rangeLengthDays(range);
  const prevTo = parse(range.from) - DAY_MS;
  return { from: fmt(prevTo - (len - 1) * DAY_MS), to: fmt(prevTo) };
}

/** Percentage change from previous to current; null when previous is 0. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatDelta(pct: number | null): string {
  if (pct === null) return "n/a";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs previous period`;
}

export function averageTicket(revenue: number, payments: number): number {
  return payments > 0 ? revenue / payments : 0;
}

export interface ComparisonPoint {
  index: number;
  current?: number;
  previous?: number;
  currentDate?: string;
  previousDate?: string;
}

/** Aligns two series by day offset so the previous period overlays the current one. */
export function alignSeries(
  current: Array<{ date: string; revenue: number }>,
  previous: Array<{ date: string; revenue: number }>,
): ComparisonPoint[] {
  const n = Math.max(current.length, previous.length);
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    current: current[i]?.revenue,
    previous: previous[i]?.revenue,
    currentDate: current[i]?.date,
    previousDate: previous[i]?.date,
  }));
}
