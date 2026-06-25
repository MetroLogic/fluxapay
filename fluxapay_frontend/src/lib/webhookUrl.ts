/**
 * Webhook endpoint URLs must be public HTTPS. Localhost is rejected for production-style checks;
 * use the test modal with a tunneled https URL (e.g. ngrok) if needed.
 */
export function isValidHttpsWebhookUrl(raw: string): { ok: true } | { ok: false; message: string } {
  const s = raw.trim();
  if (!s) {
    return { ok: false, message: "Enter a webhook URL." };
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { ok: false, message: "Invalid URL." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "Webhook URL must use https://." };
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return {
      ok: false,
      message: "Use a public https URL. For local testing, expose your server with a tunnel and use that URL.",
    };
  }
  return { ok: true };
}
