"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CreditCard,
  Landmark,
  BarChart3,
  Settings,
  Code,
  X,
  Webhook,
  FileText,
  RefreshCcw,
} from "lucide-react";
import Image from "next/image";
import FluxapayLogo from "@/assets/fluxapaylogo.png";

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

const navItems = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Payments", href: "/dashboard/payments", icon: CreditCard },
  { name: "Invoices", href: "/dashboard/invoices", icon: FileText },
  { name: "Refunds", href: "/dashboard/refunds", icon: RefreshCcw },
  { name: "Settlements", href: "/dashboard/settlements", icon: Landmark },
  { name: "Webhooks", href: "/dashboard/webhooks", icon: Webhook },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Developers", href: "/dashboard/developers", icon: Code },
];

export function Sidebar({ className, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-in-out md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "fixed left-0 top-0 z-40 md:static",
        className
      )}
    >
      <div className="flex h-16 items-center justify-between px-6 border-b border-sidebar-border">
        {/* Logo and Name */}
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-auto">
            <Image
              src={FluxapayLogo}
              alt="Fluxapay"
              className="h-full w-auto object-contain"
              priority
            />
          </div>
          <span className="text-2xl font-bold tracking-tight text-sidebar-primary-foreground">
            <span className="text-primary">FluxaPay</span>
          </span>
        </div>

        {/* Close button for mobile */}
        <button
          onClick={onClose}
          className="md:hidden text-sidebar-foreground hover:text-primary transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-[16px] font-semibold transition-all border-l-4",
                isActive
                  ? "bg-[#F1EFFF] text-[#5F44EC] border-[#5F44EC]"
                  : "text-grey hover:text-black hover:bg-[#F1EFFF]/50 border-transparent"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-colors"
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="text-xs text-muted-foreground text-center">
          &copy; 2026 Fluxapay Inc.
        </div>
      </div>
    </aside>
  );
}
