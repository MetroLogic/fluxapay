"use client";

import Link from "next/image";
import Image from "next/image";
import logo from "@/assets/fluxapaylogo.png";

export const Footer = () => {
  return (
    <footer className="bg-[#0B0527] pt-24 pb-12 text-white/60">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8 mb-20">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <Image src={logo} alt="Fluxapay Logo" width={29} height={30} className="brightness-0 invert opacity-80" />
              <span className="text-2xl font-bold text-white tracking-tight">fluxapay</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed">
              Bridging the gap between crypto adoption and real-world commerce.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Legal</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Use</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Product</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li><a href="#" className="hover:text-white transition-colors">Sign Up</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Log In</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Resources</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li><a href="#" className="hover:text-white transition-colors">Docs</a></li>
              <li><a href="#" className="hover:text-white transition-colors">FAQs / Support</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact us</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-center items-center gap-6">
          <p className="text-sm font-medium">
            © {new Date().getFullYear()} borderless. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
