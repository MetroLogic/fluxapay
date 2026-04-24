import { Metadata } from "next";

export const SITE_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://fluxapay.com";
export const SITE_NAME = "FluxaPay";
export const SITE_DESCRIPTION =
  "The next generation of global payments. Accept crypto and fiat seamlessly.";
export const SITE_IMAGE = `${SITE_BASE_URL}/og-image.png`;

/**
 * Base metadata object with defaults for all pages
 */
export const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_BASE_URL),
  title: {
    default: `${SITE_NAME} | Global Payment Infrastructure`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "payments",
    "crypto payments",
    "fiat payments",
    "payment platform",
    "payment infrastructure",
    "cryptocurrency",
    "blockchain",
    "global payments",
    "payment gateway",
    "merchant payments",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    title: `${SITE_NAME} | Global Payment Infrastructure`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    url: SITE_BASE_URL,
    images: [
      {
        url: SITE_IMAGE,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Global Payment Infrastructure`,
    description: SITE_DESCRIPTION,
    images: [SITE_IMAGE],
    creator: "@fluxapay",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_BASE_URL,
  },
  manifest: "/manifest.json",
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FED449" },
    { media: "(prefers-color-scheme: dark)", color: "#2E3539" },
  ],
};

/**
 * Options for generating page-specific metadata
 */
export interface PageMetadataOptions {
  title: string;
  description: string;
  slug: string;
  image?: string;
  keywords?: string[];
  locale?: string;
  ogType?: "article" | "website";
  publishedDate?: string;
  updatedDate?: string;
}

/**
 * Generate page-specific metadata with OpenGraph, Twitter Cards, and canonical URLs
 */
export function generatePageMetadata({
  title,
  description,
  slug,
  image = SITE_IMAGE,
  keywords: pageKeywords,
  locale = "en",
  ogType = "website",
  publishedDate,
  updatedDate,
}: PageMetadataOptions): Metadata {
  const pageUrl = `${SITE_BASE_URL}/${locale}${slug}`;
  const finalKeywords =
    pageKeywords && pageKeywords.length > 0 ? pageKeywords : undefined;

  return {
    title,
    description,
    keywords: finalKeywords,
    openGraph: {
      type: ogType,
      title,
      description,
      url: pageUrl,
      siteName: SITE_NAME,
      locale: `${locale}_US`,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
          type: "image/png",
        },
      ],
      ...(publishedDate && { publishedTime: publishedDate }),
      ...(updatedDate && { modifiedTime: updatedDate }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
      creator: "@fluxapay",
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}

/**
 * Generate JSON-LD structured data for rich snippets
 */
export interface JsonLdOptions {
  type: "Organization" | "WebPage" | "Article" | "LocalBusiness";
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  contactPoint?: {
    telephone: string;
    contactType: string;
  };
}

export function generateJsonLd(
  options: JsonLdOptions,
): Record<string, unknown> {
  const baseJsonLd = {
    "@context": "https://schema.org",
    "@type": options.type,
    name: options.title || SITE_NAME,
    url: options.url || SITE_BASE_URL,
    ...(options.image && { image: options.image }),
  };

  if (options.type === "Organization") {
    return {
      ...baseJsonLd,
      alternateName: SITE_NAME,
      description: options.description || SITE_DESCRIPTION,
      logo: SITE_IMAGE,
      sameAs: ["https://twitter.com/fluxapay", "https://github.com/fluxapay"],
      ...(options.contactPoint && { contactPoint: options.contactPoint }),
    };
  }

  if (options.type === "Article") {
    return {
      ...baseJsonLd,
      headline: options.title,
      description: options.description,
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
    };
  }

  return baseJsonLd;
}

/**
 * Create a Script component for JSON-LD
 */
export function createJsonLdScript(data: Record<string, unknown>) {
  return JSON.stringify(data);
}
