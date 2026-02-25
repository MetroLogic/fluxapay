import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/admin/overview',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
