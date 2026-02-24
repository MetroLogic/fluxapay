"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Wallet,
  Webhook,
  FileText,
  ClipboardList,
  Settings,
  ShieldCheck,
  Menu,
  X,
  ServerCog,
  Scale,
  Zap,
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/admin/overview", icon: LayoutDashboard },
  { name: "Merchants", href: "/admin/merchants", icon: Users },
  { name: "Payments", href: "/admin/payments", icon: CreditCard },
  { name: "Settlements", href: "/admin/settlements", icon: Wallet },
  { name: "Reconciliation", href: "/admin/reconciliation", icon: Scale },
  { name: "Sweep", href: "/admin/sweep", icon: Zap },
  { name: "Webhooks", href: "/admin/webhooks", icon: Webhook },
  { name: "System", href: "/admin/system", icon: ServerCog },
  { name: "KYC", href: "/admin/kyc", icon: FileText },
  { name: "Audit Logs", href: "/admin/audit-logs", icon: ClipboardList },
  { name: "Config", href: "/admin/config", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Helper to check if link is active
  const isActive = (href: string) =>
    pathname === href || (href === "/admin/overview" && pathname === "/admin");

  return (
    <>
      {/* Mobile Toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-slate-200 rounded-md"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar Container */}
      <aside
        className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-100">
            <div
              className="p-1.5 rounded-lg"
              style={{ backgroundColor: "oklch(0.205 0 0)" }}
            >
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">
              FluxaPay
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navigation.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <item.icon
                    className={`w-5 h-5 ${active ? "text-slate-900" : "text-slate-400"}`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User Profile Section (Bottom) */}
          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 px-2 py-3 rounded-lg bg-slate-50">
              <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  Admin User
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  Super Admin
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Wallet,
  Webhook,
  FileText,
  ClipboardList,
  Settings,
  ShieldCheck,
  Menu,
  X,
  ServerCog,
  Scale,
  Zap,
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/admin/overview", icon: LayoutDashboard },
  { name: "Merchants", href: "/admin/merchants", icon: Users },
  { name: "Payments", href: "/admin/payments", icon: CreditCard },
  { name: "Settlements", href: "/admin/settlements", icon: Wallet },
  { name: "Reconciliation", href: "/admin/reconciliation", icon: Scale },
  { name: "Sweep", href: "/admin/sweep", icon: Zap },
  { name: "Webhooks", href: "/admin/webhooks", icon: Webhook },
  { name: "System", href: "/admin/system", icon: ServerCog },
  { name: "KYC", href: "/admin/kyc", icon: FileText },
  { name: "Audit Logs", href: "/admin/audit-logs", icon: ClipboardList },
  { name: "Config", href: "/admin/config", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Helper to check if link is active
  const isActive = (href: string) =>
    pathname === href || (href === "/admin/overview" && pathname === "/admin");

  return (
    <>
      {/* Mobile Toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-slate-200 rounded-md"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar Container */}
      <aside
        className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-100">
            <div
              className="p-1.5 rounded-lg"
              style={{ backgroundColor: "oklch(0.205 0 0)" }}
            >
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">
              FluxaPay
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navigation.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <item.icon
                    className={`w-5 h-5 ${active ? "text-slate-900" : "text-slate-400"}`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User Profile Section (Bottom) */}
          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 px-2 py-3 rounded-lg bg-slate-50">
              <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  Admin User
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  Super Admin
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}