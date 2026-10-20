export const STATIC_SECURITY_HEADERS = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
} as const;

export function createCspNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function configuredFrameAncestors(): string[] {
  return (process.env.CSP_FRAME_ANCESTORS ?? "")
    .split(/\s+/)
    .filter((origin) => {
      try {
        const parsed = new URL(origin);
        return (
          parsed.origin === origin &&
          !parsed.hostname.includes("*") &&
          (parsed.protocol === "https:" ||
            (parsed.protocol === "http:" && parsed.hostname === "localhost"))
        );
      } catch {
        return false;
      }
    });
}

function configuredReportUri(): string | undefined {
  const reportUri = process.env.NEXT_PUBLIC_CSP_REPORT_URI;
  if (!reportUri) return undefined;

  try {
    const parsed = new URL(reportUri);
    return parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function createContentSecurityPolicy(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://albedo.link${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://horizon.stellar.org",
      "https://horizon-testnet.stellar.org",
      "https://*.ingest.sentry.io",
      "https://api.web3modal.org",
      "https://rpc.walletconnect.org",
      "https://pulse.walletconnect.org",
      "https://secure.walletconnect.org",
      "https://secure-mobile.walletconnect.com",
      "https://secure-mobile.walletconnect.org",
      "wss://relay.walletconnect.org",
    ].join(" "),
    "frame-src 'self' https://checkout.fluxapay.com",
    `frame-ancestors 'self' ${configuredFrameAncestors().join(" ")}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  const reportUri = configuredReportUri();
  if (reportUri) directives.push(`report-uri ${reportUri}`);

  return directives.join("; ");
}

export function applySecurityHeaders<T extends { headers: Headers }>(
  response: T,
  nonce: string,
): T {
  response.headers.set("Content-Security-Policy", createContentSecurityPolicy(nonce));
  response.headers.set("Cache-Control", "private, no-store");
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}