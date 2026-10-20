import dns from "dns";
import net from "net";
import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);
const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost", ".lan", ".intranet", ".corp", ".home"];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** True if the IP (v4 or v6) is loopback, link-local, private, metadata or otherwise internal. */
export function isProhibitedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_RANGES.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isProhibitedIp(mapped[1]);
    if (lower === "::1" || lower === "::") return true;
    if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    return false;
  }
  return false;
}

export function isProhibitedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true;
  return !h.includes(".") && !net.isIP(h); // single-label internal names
}

type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => {
  const results = await dns.promises.lookup(hostname, { all: true });
  return results.map((r) => r.address);
};

/**
 * Validates a merchant webhook URL against SSRF: enforces HTTPS (outside development),
 * rejects internal hostnames, and DNS-resolves the host rejecting any prohibited IP.
 * Skipped when NODE_ENV === "development".
 */
export async function assertSafeWebhookUrl(
  rawUrl: string,
  resolver: Resolver = defaultResolver,
): Promise<void> {
  if (process.env.NODE_ENV === "development") return;

  const bad = (msg: string) => apiError(400, ErrorCode.INVALID_REQUEST_BODY, msg);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw bad("webhook_url must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw bad("webhook_url must use HTTPS");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(hostname)) {
    if (isProhibitedIp(hostname)) throw bad("webhook_url must not target a private or internal IP address");
    return;
  }
  if (isProhibitedHostname(hostname)) {
    throw bad("webhook_url must not target an internal hostname");
  }

  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw bad("webhook_url hostname could not be resolved");
  }
  if (addresses.length === 0 || addresses.some(isProhibitedIp)) {
    throw bad("webhook_url resolves to a private or internal IP address");
  }
}
