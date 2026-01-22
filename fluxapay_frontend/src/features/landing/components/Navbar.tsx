"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/Button";
import logo from "@/assets/fluxapaylogo.png";

export const Navbar = () => {
  return (
    <div className="fixed top-8 left-0 right-0 z-50 px-4 flex justify-center pointer-events-none">
      <nav className="w-full max-w-[900px] h-[70px] bg-white rounded-2xl shadow-xl flex items-center justify-between px-6 pointer-events-auto">
        <div className="flex items-center gap-2">
          <Image 
            src={logo} 
            alt="Fluxapay Logo" 
            width={29} 
            height={30} 
            className="object-contain"
          />
        </div>
        
        <div className="hidden md:flex items-center gap-10">
          <Link href="/" className="text-sm font-semibold text-[#2E3539] hover:opacity-70 transition-opacity">
            Home
          </Link>
          <Link href="#features" className="text-sm font-semibold text-[#8A8A8A] hover:text-[#2E3539] transition-colors">
            Features
          </Link>
          <Link href="#pricing" className="text-sm font-semibold text-[#8A8A8A] hover:text-[#2E3539] transition-colors">
            Pricing
          </Link>
          <Link href="/docs" className="text-sm font-semibold text-[#8A8A8A] hover:text-[#2E3539] transition-colors">
            Documentation
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-[#D32F2F] font-semibold hover:bg-[#D32F2F]/5">
            Login
          </Button>
          <Button variant="dark" size="sm" className="rounded-xl px-6 h-[45px] font-semibold">
            Join Fluxapay
          </Button>
        </div>
      </nav>
    </div>
  );
};
