import { isIP } from "node:net";

interface ParsedAddress {
  bits: 32 | 128;
  value: bigint;
}

function parseIPv4(address: string): bigint | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").reduce((value, part) => (value << 8n) | BigInt(part), 0n);
}

function parseIPv6(address: string): bigint | null {
  if (isIP(address) !== 6) return null;

  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const ipv4 = parseIPv4(normalized.slice(separator + 1));
    if (ipv4 === null) return null;
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    normalized = `${normalized.slice(0, separator)}:${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0;
  if ((halves.length === 2 && zeroCount < 1) || left.length + right.length + zeroCount !== 8) {
    return null;
  }

  const groups = [...left, ...Array(zeroCount).fill("0"), ...right];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function parseAddress(address: string): ParsedAddress | null {
  if (isIP(address) === 4) {
    const value = parseIPv4(address);
    return value === null ? null : { bits: 32, value };
  }
  if (isIP(address) === 6) {
    const value = parseIPv6(address);
    return value === null ? null : { bits: 128, value };
  }
  return null;
}

function getMappedIPv4(address: ParsedAddress): bigint | null {
  if (address.bits !== 128 || address.value >> 32n !== 0xffffn) return null;
  return address.value & 0xffffffffn;
}

export function isValidCidr(value: string): boolean {
  const parts = value.trim().split("/");
  if (parts.length > 2 || !parts[0]) return false;
  const address = parseAddress(parts[0]);
  if (!address) return false;
  if (parts.length === 1) return true;
  if (!/^\d+$/.test(parts[1])) return false;
  const prefix = Number(parts[1]);
  return prefix >= 0 && prefix <= address.bits;
}

export function isIpAllowed(ip: string | undefined, cidrs: readonly string[]): boolean {
  if (cidrs.length === 0) return true;
  const requestAddress = ip ? parseAddress(ip) : null;
  if (!requestAddress) return false;

  return cidrs.some((cidr) => {
    const [network, prefixText] = cidr.split("/");
    let networkAddress = parseAddress(network);
    let candidateAddress = requestAddress;
    let prefix = prefixText === undefined ? networkAddress?.bits : Number(prefixText);
    if (!networkAddress || prefix === undefined) return false;

    const mappedRequest = getMappedIPv4(candidateAddress);
    if (networkAddress.bits === 32 && mappedRequest !== null) {
      candidateAddress = { bits: 32, value: mappedRequest };
    } else if (candidateAddress.bits === 32 && networkAddress.bits === 128) {
      const mappedNetwork = getMappedIPv4(networkAddress);
      if (mappedNetwork !== null && prefix >= 96) {
        networkAddress = { bits: 32, value: mappedNetwork };
        prefix -= 96;
      }
    }

    if (networkAddress.bits !== candidateAddress.bits) return false;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > networkAddress.bits) return false;
    const hostBits = BigInt(networkAddress.bits - prefix);
    return (candidateAddress.value >> hostBits) === (networkAddress.value >> hostBits);
  });
}