import type { Metadata } from "next";
import { Inter, Caveat } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./providers";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${caveat.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
