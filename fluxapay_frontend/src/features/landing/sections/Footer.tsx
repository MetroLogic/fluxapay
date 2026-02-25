"use client";

import Image from "next/image";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { DOCS_URLS } from "@/lib/docs";

const FooterSection = ({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) => (
  <div>
    <h3 className="text-sm font-bold text-[#8A8A8A] mb-6 tracking-wide uppercase">
      {title}
    </h3>
    <ul className="space-y-3">
      {links.map((link, idx) => (
        <li key={idx}>
          <Link
            href={link.href}
            className="text-[#A0A0A0] hover:text-white transition-colors duration-200 text-sm"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

export const Footer = () => {
  const t = useTranslations("footer");
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    legal: [
      { label: t("privacy"), href: "/privacy" },
      { label: t("terms"), href: "/terms" },
    ],
    product: [
      { label: t("signUp"), href: "/signup" },
      { label: t("login"), href: "/login" },
      { label: t("pricing"), href: DOCS_URLS.PRICING },
    ],
    resources: [
      { label: t("documentation"), href: DOCS_URLS.FULL_DOCS },
      { label: t("faqs"), href: DOCS_URLS.FAQS },
      { label: t("contact"), href: DOCS_URLS.CONTACT },
    ],
  };

  return (
    <footer className="bg-[#0F0F1E] text-white py-24">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16 pb-16 border-b border-gray-800">
          {/* Logo / Brand */}
          <div className="col-span-1">
            <Image
              src="/Logo.svg"
              alt="FluxaPay Logo"
              width={150}
              height={40}
              className="mb-4"
            />
          </div>

          {/* Footer Sections */}
          <FooterSection title={t("legal")} links={footerLinks.legal} />
          <FooterSection title={t("product")} links={footerLinks.product} />
          <FooterSection title={t("resources")} links={footerLinks.resources} />
        </div>

        {/* Copyright */}
        <div className="text-center">
          <p className="text-[#8A8A8A] text-sm">
            {t("copyright", { year: currentYear })}
          </p>
        </div>
      </div>
    </footer>
  );
};
