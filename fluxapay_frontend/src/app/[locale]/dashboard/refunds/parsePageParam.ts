/** Parse a `page` query param into a usable 1-based page number. */
export function parsePageParam(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
