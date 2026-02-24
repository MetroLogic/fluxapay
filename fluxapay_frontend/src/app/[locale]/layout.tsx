import type { Metadata } from "next";
import { Inter, Caveat } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "../providers";
import { Toaster } from "react-hot-toast";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: "FluxaPay | Global Payment Infrastructure",
  description: "The next generation of global payments. Accept crypto and fiat seamlessly.",
};

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
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} ${caveat.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
          <Toaster position="top-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
