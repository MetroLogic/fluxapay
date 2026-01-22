"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/logo.svg";

export const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);

    const navLinks = [
        { name: "Home", href: "/" },
        { name: "Features", href: "#features" },
        { name: "Pricing", href: "#pricing" },
        { name: "Documentation", href: "#docs" },
    ];

    return (
        <nav className="relative top-6 left-0 right-0 z-99 flex justify-center px-4">
            <div className="navbar w-full max-w-5xl rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-300 border border-black/10">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2">
                    <Image src={logo} alt="Fluxapay Logo" width={32} height={32} className="w-8 h-8" />
                </Link>

                {/* Desktop Links */}
                <div className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            className="text-lg font-semibold text-grey hover:text-black transition-colors"
                        >
                            {link.name}
                        </Link>
                    ))}
                </div>

                {/* Action Buttons */}
                <div className="hidden md:flex items-center gap-3">
                    <Link
                        href="/login"
                        className="px-5 py-2 text-lg font-semibold text-error rounded-full transition-all"
                    >
                        Login
                    </Link>
                    <Link
                        href="/join"
                        className="px-5 py-2 text-lg font-semibold text-white bg-black hover:bg-zinc-800 rounded-lg transition-all"
                    >
                        Join Fluxapay
                    </Link>
                </div>

                {/* Mobile menu button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="md:hidden p-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
                    aria-label="Toggle menu"
                >
                    {isOpen ? (
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Mobile Menu Dropdown */}
            <div
                className={`navbar absolute inset-x-4 top-18 backdrop-blur-lg border border-black/10 rounded-xl p-6 shadow-2xl transition-all duration-300 md:hidden ${isOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-4 pointer-events-none"
                    }`}
            >
                <div className="flex flex-col gap-4">
                    {navLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            onClick={() => setIsOpen(false)}
                            className="text-lg font-medium text-grey hover:text-black"
                        >
                            {link.name}
                        </Link>
                    ))}
                    <div className="h-px bg-zinc-100 my-2" />
                    <div className="flex flex-col gap-3">
                        <Link
                            href="/login"
                            onClick={() => setIsOpen(false)}
                            className="w-full py-3 text-center text-lg font-semibold text-error"
                        >
                            Login
                        </Link>
                        <Link
                            href="/join"
                            onClick={() => setIsOpen(false)}
                            className="w-full py-3 text-center font-semibold text-white bg-zinc-900 rounded-lg"
                        >
                            Join Fluxapay
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
};