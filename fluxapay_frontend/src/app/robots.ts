// This file configures robots.txt for telling search engines which pages to crawl

import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/dashboard", "/api/"],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/admin", "/dashboard"],
        crawlDelay: 0,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/admin", "/dashboard"],
        crawlDelay: 1,
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fluxapay.com"}/sitemap.xml`,
  };
}
