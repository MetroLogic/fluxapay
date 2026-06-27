import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  env: {
    // Expose status page URL to the browser bundle.
    // Set NEXT_PUBLIC_STATUS_URL in your .env to point at an external
    // uptime page (e.g. https://status.fluxapay.com). Falls back to /status.
    NEXT_PUBLIC_STATUS_URL: process.env.NEXT_PUBLIC_STATUS_URL ?? "/status",
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "next-intl/config": "./i18n/request.ts",
      "react-is": "./src/shims/react-is.ts",
    },
  },
  webpack(config) {
    config.resolve.alias["next-intl/config"] = path.resolve(
      __dirname,
      "i18n/request.ts",
    );
    config.resolve.alias["react-is"] = path.resolve(
      __dirname,
      "src/shims/react-is.ts",
    );
    return config;
  },
  async headers() {
    // CSP trusted script origins:
    // - 'self': app's own scripts from the origin
    // - https://albedo.link: Albedo wallet provider
    // - Freighter is injected via browser extension (no explicit CSP needed for extension content)
    // - Nonces can be added at runtime for inline scripts if needed
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' https://albedo.link",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      process.env.NEXT_PUBLIC_CSP_REPORT_URI ? `report-uri ${process.env.NEXT_PUBLIC_CSP_REPORT_URI}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/pay/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, stale-while-revalidate=86400",
          },
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-no-referrer" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-no-referrer" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
    ];
  },
  async redirects() {
    const redirects = [
      {
        source: "/admin",
        destination: "/admin/overview",
        permanent: true,
      },
    ];

    // If an external docs URL is configured, redirect /docs and /docs/* to it.
    const externalDocsUrl = process.env.NEXT_PUBLIC_EXTERNAL_DOCS_URL;
    if (externalDocsUrl) {
      const targetUrl = externalDocsUrl.endsWith("/") ? externalDocsUrl.slice(0, -1) : externalDocsUrl;
      
      // Redirect sub-paths while preserving the path
      redirects.push({
        source: "/docs/:path*",
        destination: `${targetUrl}/:path*`,
        permanent: false,
      });

      // Redirect the base /docs path
      redirects.push({
        source: "/docs",
        destination: targetUrl,
        permanent: false,
      });
    }

    return redirects;
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
});
