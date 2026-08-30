"use client";

import { Menu, Bell, User, Moon, Sun, Command, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/Button";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useDashboardNotifications } from "@/hooks/useDashboardNotifications";
import { logout } from "@/lib/auth";
import { useState, useEffect, useRef } from "react";

interface TopNavProps {
    onMenuClick: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { isDark, isMounted, toggleTheme } = useTheme();
    const { unreadCount } = useDashboardNotifications({ webhookLimit: 5, payoutLimit: 5 });
    const [isMac, setIsMac] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setIsMac(typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0);
    }, []);

    // Close the profile dropdown when clicking outside.
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleNavigate = (path: string) => {
        setIsProfileOpen(false);
        router.push(path);
    };

    const handleLogout = () => {
        setIsProfileOpen(false);
        logout();
    };

    const getTitle = () => {
        if (pathname === "/dashboard") return "Overview";
        const segments = pathname.split("/").filter(Boolean);
        const last = segments[segments.length - 1];
        return last ? last.charAt(0).toUpperCase() + last.slice(1) : "Dashboard";
    };

    const getCommandKey = () => isMac ? "⌘K" : "Ctrl+K";

    return (
        <header aria-label="Dashboard top navigation" className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
            {/* Mobile Menu Trigger */}
            <Button
                variant="ghost"
                size="icon"
                className="md:hidden mr-2"
                onClick={onMenuClick}
            >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
            </Button>

            {/* Breadcrumbs / Title */}
            <div className="flex-1">
                <h1 className="text-lg font-semibold text-foreground">{getTitle()}</h1>
            </div>

            {/* Command Palette Shortcut Hint */}
            <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex gap-2 text-muted-foreground"
                onClick={() => {
                    const event = new KeyboardEvent('keydown', {
                        key: 'k',
                        code: 'KeyK',
                        metaKey: isMac,
                        ctrlKey: !isMac,
                    });
                    window.dispatchEvent(event);
                }}
                title={`Open command palette (${getCommandKey()})`}
            >
                <Command className="h-4 w-4" />
                <span className="text-xs">{getCommandKey()}</span>
            </Button>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative text-muted-foreground hover:text-foreground"
                    onClick={() => router.push("/dashboard/notifications")}
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                    <span className="sr-only">Notifications</span>
                </Button>
                {isMounted && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={toggleTheme}
                        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </Button>
                )}
                <div ref={profileRef} className="relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="ml-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        onClick={() => setIsProfileOpen((prev) => !prev)}
                        aria-haspopup="menu"
                        aria-expanded={isProfileOpen}
                        aria-label="Profile menu"
                        title="Profile"
                    >
                        <User className="h-5 w-5" />
                        <span className="sr-only">Profile</span>
                    </Button>
                    {isProfileOpen && (
                        <div
                            role="menu"
                            aria-label="Profile"
                            className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-border bg-background py-1 shadow-lg"
                        >
                            <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground hover:bg-muted"
                                onClick={() => handleNavigate("/dashboard/settings")}
                            >
                                <User className="h-4 w-4" />
                                Profile
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground hover:bg-muted"
                                onClick={() => handleNavigate("/dashboard/settings")}
                            >
                                <Settings className="h-4 w-4" />
                                Settings
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground hover:bg-muted"
                                onClick={handleLogout}
                            >
                                <LogOut className="h-4 w-4" />
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
