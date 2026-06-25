"use client";

import { Menu, Bell, User } from "lucide-react";
import { Button } from "@/components/Button";
import { usePathname, useRouter } from "next/navigation";
import { useDashboardNotifications } from "@/hooks/useDashboardNotifications";

interface TopNavProps {
    onMenuClick: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { unreadCount } = useDashboardNotifications({ webhookLimit: 5, payoutLimit: 5 });

    const getTitle = () => {
        if (pathname === "/dashboard") return "Overview";
        const segments = pathname.split("/").filter(Boolean);
        const last = segments[segments.length - 1];
        return last ? last.charAt(0).toUpperCase() + last.slice(1) : "Dashboard";
    };

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
                <Button variant="ghost" size="icon" className="ml-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80">
                    <User className="h-5 w-5" />
                    <span className="sr-only">Profile</span>
                </Button>
            </div>
        </header>
    );
}
