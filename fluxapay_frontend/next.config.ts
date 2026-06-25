import type { NextConfig } from "next";
import path from "node:path";

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
    return [
      {
        // Prevent the browser from caching the service worker script so updates
        // are picked up immediately on the next page load.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // Allow the checkout shell HTML to be served stale while the SW
        // revalidates it in the background (matching the SW strategy).
        source: "/pay/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, stale-while-revalidate=86400",
          },
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

export default nextConfig;
