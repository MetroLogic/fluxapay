"use client";

import Image from "next/image";

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    legal: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Use", href: "#" }
    ],
    product: [
      { label: "Sign Up", href: "#" },
      { label: "Log In", href: "#" },
      { label: "Pricing", href: "#" }
    ],
    resources: [
      { label: "Docs", href: "#" },
      { label: "FAQs / Support", href: "#" },
      { label: "Contact us", href: "#" }
    ]
  };

  const FooterSection = ({ title, links }: { title: string; links: Array<{ label: string; href: string }> }) => (
    <div>
      <h3 className="text-sm font-bold text-[#8A8A8A] mb-6 tracking-wide uppercase">
        {title}
      </h3>
      <ul className="space-y-3">
        {links.map((link, idx) => (
          <li key={idx}>
            <a 
              href={link.href}
              className="text-[#A0A0A0] hover:text-white transition-colors duration-200 text-sm"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );

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
          <FooterSection title="Legal" links={footerLinks.legal} />
          <FooterSection title="Product" links={footerLinks.product} />
          <FooterSection title="Resources" links={footerLinks.resources} />
        </div>

        {/* Copyright */}
        <div className="text-center">
          <p className="text-[#8A8A8A] text-sm">
            © {currentYear} borderless. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
