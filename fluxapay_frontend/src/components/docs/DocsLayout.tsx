"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Key, Rocket, Gauge, BookOpen } from "lucide-react";

interface DocsLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  {
    title: "Getting Started",
    href: "/docs/getting-started",
    icon: Rocket,
  },
  {
    title: "API Reference",
    href: "/docs/api-reference",
    icon: BookOpen,
  },
  {
    title: "Authentication",
    href: "/docs/authentication",
    icon: Key,
  },
  {
    title: "Rate Limits",
    href: "/docs/rate-limits",
    icon: Gauge,
  },
];

export function DocsLayout({ children }: DocsLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen border-r border-slate-200 bg-white hidden lg:block sticky top-0">
          <div className="p-6">
            <Link href="/docs" className="flex items-center gap-2 mb-6">
              <FileText className="h-6 w-6 text-amber-600" />
              <span className="font-bold text-lg text-slate-900">Documentation</span>
            </Link>
            <nav className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-amber-50 text-amber-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">
          <div className="max-w-4xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
