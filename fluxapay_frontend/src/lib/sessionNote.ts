import { getToken } from "@/lib/auth";

/**
 * Builds a human-readable session note from the current JWT's `iat`
 * (issued-at) claim. Returns a neutral default when there is no token, the
 * token has no payload, or decoding fails.
 */
export function getSessionNote(): string {
  if (typeof window === "undefined") return "Current session active";
  try {
    const token = getToken();
    if (!token) return "No active session token found";
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return "Current session active";
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(normalized)) as { iat?: number };
    if (!payload.iat) return "Current session active";
    return `Last login: ${new Date(payload.iat * 1000).toLocaleString()}`;
  } catch {
    return "Current session active";
  }
}
