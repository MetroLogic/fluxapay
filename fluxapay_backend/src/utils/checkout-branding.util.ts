/**
 * Normalize merchant checkout accent to #rrggbb or return null if empty.
 */
export function normalizeCheckoutAccentHex(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  const s = input.trim();
  if (s === "") return null;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h}`;
}

export function normalizeCheckoutLogoUrl(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  const s = input.trim();
  if (s === "") return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    return s;
  } catch {
    return null;
  }
}
