# FluxaPay SEO Implementation Guide

## Overview

This document outlines the comprehensive SEO implementation for the FluxaPay frontend application using Next.js 15+ metadata APIs.

## Files Created

### 1. SEO Utilities (`src/lib/seo.ts`)

Core SEO configuration with:

- **Base metadata object**: Default metadata for all pages with title template and sensible defaults
- **Page metadata generator**: `generatePageMetadata()` function that creates page-specific metadata with:
  - Unique title and description
  - Open Graph meta tags (og:title, og:description, og:image, og:url)
  - Twitter Card metadata
  - Canonical URLs (alternates.canonical)
  - Keywords
  - Robots directives
- **JSON-LD generator**: `generateJsonLd()` for structured data
- **Configuration exports**: SITE_BASE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_IMAGE

### 2. SEO Schemas (`src/lib/seo-schemas.ts`)

Reusable JSON-LD schema generators:

- `organizationSchema()` - Organization with social profiles
- `breadcrumbSchema()` - Breadcrumb navigation
- `faqSchema()` - FAQ structured data
- `articleSchema()` - Blog posts and documentation
- `productSchema()` - Pricing/plans
- `localBusinessSchema()` - Local business information
- `softwareApplicationSchema()` - APIs and SDKs
- `jsonLdScript()` - Helper to create JSON-LD script content

### 3. Robots Configuration (`src/app/robots.ts`)

Automated robots.txt generation:

- Allows crawling of public pages
- Disallows: /admin, /dashboard, /api/
- Allows: /api/webhooks/
- Specific crawl delays for different bots

### 4. Sitemap (`src/app/sitemap.ts`)

Dynamic XML sitemap generation:

- Includes all localized public pages
- Sets priority levels for pages
- Configures change frequency

## Updates to Existing Files

### Root Layout (`src/app/layout.tsx`)

- Imports and applies `baseMetadata`
- Adds JSON-LD organization schema
- Renders schema in `<head>` with `dangerouslySetInnerHTML`

### Locale Layout (`src/app/[locale]/layout.tsx`)

- Imports `baseMetadata` and `SITE_BASE_URL`
- Maintains multilingual support with Next.js internationalization

### Dashboard Layout (`src/app/dashboard/layout.tsx`)

- Added comprehensive metadata
- Set `robots: { index: false, follow: false }` to prevent indexing of protected pages

### Admin Layout (`src/app/admin/layout.tsx`)

- Added metadata
- Set non-indexable robots directives

### Dashboard Main Page (`src/app/dashboard/page.tsx`)

- Added metadata import and export
- Set protected page robots directives

### Admin Payments Page (`src/app/admin/payments/page.tsx`)

- Updated metadata type
- Added robots non-indexable directives

### Payment Layout (`src/app/pay/layout.tsx`)

- Created new layout for payment pages
- Added metadata with robots non-indexable directives

## Pages with SEO Metadata

### Public Pages (Indexed)

- `[locale]/page.tsx` (Home) - With JSON-LD WebPage schema
- `[locale]/login/page.tsx` - Login page
- `[locale]/signup/page.tsx` - Sign up page
- `[locale]/pricing/page.tsx` - Pricing page
- `[locale]/docs/page.tsx` - Documentation main page with breadcrumbs
- `[locale]/docs/getting-started/page.tsx` - Getting started guide
- `[locale]/docs/authentication/page.tsx` - Authentication docs
- `[locale]/docs/api-reference/page.tsx` - API reference
- `[locale]/docs/rate-limits/page.tsx` - Rate limits docs
- `[locale]/faqs/page.tsx` - FAQ page
- `[locale]/terms/page.tsx` - Terms and conditions
- `[locale]/privacy/page.tsx` - Privacy policy
- `[locale]/contact/page.tsx` - Contact page
- `[locale]/support/page.tsx` - Support center
- `[locale]/status/page.tsx` - System status
- `[locale]/community/page.tsx` - Community page

### Protected Pages (Not Indexed)

- `/dashboard/*` - All dashboard pages
- `/admin/*` - All admin pages
- `/pay/[payment_id]` - Payment checkout pages

## SEO Features Implemented

### ✅ Metadata API

- [x] Unique title and description per page
- [x] Title templates for consistent branding
- [x] Dynamic metadata with `generateMetadata()`

### ✅ Open Graph Tags

- [x] og:title, og:description, og:image, og:url
- [x] og:type for content categorization
- [x] og:locale for multilingual support
- [x] Publication and modification dates

### ✅ Twitter Cards

- [x] Twitter card type (summary_large_image)
- [x] twitter:title, twitter:description
- [x] twitter:image
- [x] Creator attribution (@fluxapay)

### ✅ Canonical URLs

- [x] alternates.canonical for each page
- [x] Locale-aware canonical URLs
- [x] Prevents duplicate content issues

### ✅ Structured Data (JSON-LD)

- [x] Organization schema in root layout
- [x] WebPage schema for home page
- [x] Breadcrumb navigation schema for docs
- [x] Article schema support
- [x] FAQ schema support
- [x] Product schema support

### ✅ Technical SEO

- [x] robots.txt with smart bot rules
- [x] XML sitemap with priorities
- [x] metadataBase URL configuration
- [x] Keywords per page
- [x] Author and publisher metadata
- [x] Language detection (lang attribute on html)

### ✅ Protected Pages

- [x] Dashboard pages marked as non-indexable
- [x] Admin pages marked as non-indexable
- [x] Payment pages marked as non-indexable

## Usage Examples

### Adding Metadata to a New Page

```typescript
import { Metadata } from "next";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    title: "Page Title",
    description: "Page description",
    slug: "/page-path",
    keywords: ["keyword1", "keyword2"],
    locale,
  });
}

export default function Page() {
  return <div>Content</div>;
}
```

### Adding JSON-LD to a Page

```typescript
import { breadcrumbSchema, jsonLdScript } from "@/lib/seo-schemas";

export default function Page() {
  const schema = breadcrumbSchema([
    { name: "Home", url: "https://fluxapay.com" },
    { name: "Current Page", url: "https://fluxapay.com/current" },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(schema)}
        suppressHydrationWarning
      />
      <div>Content</div>
    </>
  );
}
```

## Environment Configuration

Set the following environment variable in your `.env.local`:

```
NEXT_PUBLIC_SITE_URL=https://fluxapay.com
```

This ensures canonical URLs and Open Graph URLs are correct for your production domain.

## Best Practices Implemented

1. **Title Consistency**: Using `title.template` ensures all pages have consistent branding
2. **Protected Pages**: Admin and dashboard pages are not indexed by search engines
3. **Multilingual Support**: Canonical URLs respect the locale parameter
4. **Structured Data**: JSON-LD provides rich snippets for search results
5. **Robots Control**: Smart robots.txt prevents crawling of API and protected pages
6. **Sitemap Priority**: Homepage has highest priority (1.0), declining for other pages

## Testing SEO Implementation

### Desktop Testing

1. Use Chrome DevTools to inspect meta tags
2. Check Open Graph preview: https://www.opengraph.xyz/
3. Validate structured data: https://schema.org/validator/

### Mobile Testing

1. Use Google Mobile-Friendly Test
2. Check viewport metadata
3. Test responsive images

### Search Engine Tools

1. Google Search Console - Submit sitemap
2. Google Rich Results Test - Validate structured data
3. Bing Webmaster Tools - Monitor indexed pages

## Future SEO Enhancements

- [ ] Add FAQ schema to FAQs page
- [ ] Add Product schema to pricing page
- [ ] Add LocalBusiness schema to footer
- [ ] Implement dynamic meta descriptions based on page content
- [ ] Add hreflang tags for language alternatives
- [ ] Set up JSON-LD for events/webinars
- [ ] Add breadcrumb schema to all documentation pages
- [ ] Implement article schema dates

## Files Location Reference

| File                          | Purpose                        |
| ----------------------------- | ------------------------------ |
| `src/lib/seo.ts`              | Core SEO configuration         |
| `src/lib/seo-schemas.ts`      | JSON-LD schema generators      |
| `src/app/robots.ts`           | Robots.txt configuration       |
| `src/app/sitemap.ts`          | XML sitemap generation         |
| `src/app/layout.tsx`          | Root layout with base metadata |
| `src/app/[locale]/layout.tsx` | Locale layout                  |

## Notes

- All dates in metadata should be ISO 8601 format
- Images should be at least 1200x630 pixels for Open Graph
- Ensure SITE_BASE_URL environment variable is set
- Test robots.txt at `/robots.txt`
- Test sitemap at `/sitemap.xml`
