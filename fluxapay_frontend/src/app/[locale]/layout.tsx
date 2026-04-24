import type { Metadata } from "next";
import "@/styles/globals.css";
import { Providers } from "../providers";
import { Toaster } from "react-hot-toast";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { baseMetadata, SITE_BASE_URL } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return {
    ...baseMetadata,
    alternates: {
      canonical: `${SITE_BASE_URL}/${locale}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `${SITE_BASE_URL}/${l}`])
      ),
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!(routing.locales as ReadonlyArray<string>).includes(locale)) {
    notFound();
  }

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
          <Toaster position="top-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
