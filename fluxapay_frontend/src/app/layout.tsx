import type { Metadata } from "next";
import "@/styles/globals.css";
import { Providers } from "./providers";
import { Toaster } from "react-hot-toast";
import { baseMetadata, generateJsonLd, createJsonLdScript } from "@/lib/seo";

export const metadata: Metadata = {
  ...baseMetadata,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = generateJsonLd({
    type: "Organization",
    title: "FluxaPay",
    description:
      "The next generation of global payments. Accept crypto and fiat seamlessly.",
    contactPoint: {
      telephone: "+1-support",
      contactType: "Customer Service",
    },
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
