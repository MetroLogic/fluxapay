/**
 * JSON-LD Structured Data Components
 * Provides reusable JSON-LD schema generators for various content types
 */

import { SITE_NAME, SITE_BASE_URL, SITE_IMAGE } from "./seo";

/**
 * Organization schema with social profiles and contact information
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_BASE_URL,
    logo: SITE_IMAGE,
    description: "The next generation of global payments infrastructure",
    sameAs: [
      "https://twitter.com/fluxapay",
      "https://github.com/fluxapay",
      "https://linkedin.com/company/fluxapay",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+1-support",
      contactType: "Customer Service",
      email: "support@fluxapay.com",
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "US",
      addressLocality: "San Francisco",
      addressRegion: "CA",
    },
  };
}

/**
 * Breadcrumb navigation schema
 */
export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * FAQ schema for structured FAQ content
 */
export function faqSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/**
 * Article schema for blog posts and documentation
 */
export function articleSchema(options: {
  headline: string;
  description: string;
  image?: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: options.headline,
    description: options.description,
    image: options.image || SITE_IMAGE,
    author: {
      "@type": "Organization",
      name: options.author || SITE_NAME,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: SITE_IMAGE,
      },
    },
    datePublished: options.datePublished,
    dateModified: options.dateModified || options.datePublished,
    url: options.url,
  };
}

/**
 * Product schema for pricing/plans
 */
export function productSchema(options: {
  name: string;
  description: string;
  price: string;
  currency: string;
  availability?: "InStock" | "OutOfStock";
  ratingValue?: number;
  ratingCount?: number;
}) {
  const aggregateRating = options.ratingValue
    ? {
        "@type": "AggregateRating",
        ratingValue: options.ratingValue,
        ratingCount: options.ratingCount || 1,
      }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: options.name,
    description: options.description,
    image: SITE_IMAGE,
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    offers: {
      "@type": "Offer",
      url: SITE_BASE_URL,
      priceCurrency: options.currency,
      price: options.price,
      availability: `https://schema.org/${options.availability || "InStock"}`,
    },
    ...(aggregateRating && { aggregateRating }),
  };
}

/**
 * LocalBusiness schema
 */
export function localBusinessSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: SITE_NAME,
    image: SITE_IMAGE,
    url: SITE_BASE_URL,
    telephone: "+1-support",
    address: {
      "@type": "PostalAddress",
      addressCountry: "US",
      addressLocality: "San Francisco",
      addressRegion: "CA",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Service",
      telephone: "+1-support",
    },
  };
}

/**
 * SoftwareApplication schema for APIs/SDKs
 */
export function softwareApplicationSchema(options: {
  name: string;
  description: string;
  version?: string;
  operatingSystem?: string[];
  ratingValue?: number;
  ratingCount?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: options.name,
    description: options.description,
    url: SITE_BASE_URL,
    version: options.version,
    downloadUrl: `${SITE_BASE_URL}/docs`,
    operatingSystem: options.operatingSystem || ["Web"],
    applicationCategory: "DeveloperApplication",
    ...(options.ratingValue && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: options.ratingValue,
        ratingCount: options.ratingCount || 1,
      },
    }),
  };
}

/**
 * JSON-LD Script component helper
 */
export function jsonLdScript(data: Record<string, unknown>) {
  return {
    __html: JSON.stringify(data),
  };
}
