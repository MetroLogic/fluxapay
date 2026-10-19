function isValidIpAddress(address: string): { version: 4 | 6; bits: 32 | 128 } | null {
  const octets = address.split(".");
  if (octets.length === 4 && octets.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)) {
    return { version: 4, bits: 32 };
  }

  if (!address.includes(":")) return null;
  try {
    new URL(`http://[${address}]/`);
    return { version: 6, bits: 128 };
  } catch {
    return null;
  }
}

export function isValidCidrRange(value: string): boolean {
  const parts = value.trim().split("/");
  if (parts.length > 2 || !parts[0]) return false;
  const address = isValidIpAddress(parts[0]);
  if (!address) return false;
  if (parts.length === 1) return true;
  if (!/^\d+$/.test(parts[1])) return false;
  const prefix = Number(parts[1]);
  return prefix >= 0 && prefix <= address.bits;
}

export function parseCidrAllowlist(value: string): string[] {
  const ranges = [...new Set(value.split(/[\n,]/).map((range) => range.trim()).filter(Boolean))];
  if (ranges.length > 50) throw new Error("Enter no more than 50 CIDR blocks.");
  const invalid = ranges.filter((range) => !isValidCidrRange(range));
  if (invalid.length > 0) {
    throw new Error(`Invalid CIDR block: ${invalid[0]}`);
  }
  return ranges;
}