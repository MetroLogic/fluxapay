"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "../components/Sidebar";
import { TopNav } from "../components/TopNav";
import { CommandPalette } from "@/components/CommandPalette";

interface DashboardShellProps {
    children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Close mobile menu on Escape key
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && isMobileMenuOpen) {
            setIsMobileMenuOpen(false);
        }
    }, [isMobileMenuOpen]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Skip to main content */}
            <a href="#main-content" className="skip-to-content">
                Skip to main content
            </a>

            {/* Overlay for mobile */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-hidden="true"
                />
            )}
            <CommandPalette />
            <Sidebar
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
                className="z-40"
            />

            <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
                <TopNav onMenuClick={() => setIsMobileMenuOpen(true)} />
                <main id="main-content" className="flex-1 p-6 md:p-8" role="main" tabIndex={-1}>
                    {children}
                </main>
            </div>
        </div>
    );
}
