import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://fluxapay.com";
  const locales = ["en", "fr", "pt"];

  // Public pages that should be indexed
  const publicPages = [
    { path: "", priority: 1.0 },
    { path: "/pricing", priority: 0.8 },
    { path: "/docs", priority: 0.8 },
    { path: "/docs/getting-started", priority: 0.7 },
    { path: "/docs/authentication", priority: 0.7 },
    { path: "/docs/api-reference", priority: 0.7 },
    { path: "/docs/rate-limits", priority: 0.7 },
    { path: "/faqs", priority: 0.7 },
    { path: "/community", priority: 0.6 },
    { path: "/status", priority: 0.6 },
    { path: "/support", priority: 0.6 },
    { path: "/contact", priority: 0.6 },
    { path: "/terms", priority: 0.5 },
    { path: "/privacy", priority: 0.5 },
    { path: "/login", priority: 0.4 },
    { path: "/signup", priority: 0.8 },
  ];

  const sitemap: MetadataRoute.Sitemap = [];

  // Add localized versions of public pages
  for (const locale of locales) {
    for (const page of publicPages) {
      sitemap.push({
        url: `${baseUrl}/${locale}${page.path}`,
        lastModified: new Date(),
        changeFrequency: page.path === "" ? "weekly" : "monthly",
        priority: page.priority,
      });
    }
  }

  return sitemap;
}
