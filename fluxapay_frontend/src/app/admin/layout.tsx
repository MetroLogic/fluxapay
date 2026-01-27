"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Users,
    CreditCard,
    Wallet,
    Webhook,
    Settings,
    ShieldCheck
} from 'lucide-react';

const navigation = [
    { name: 'Merchants', href: '/admin/merchants', icon: Users },
    { name: 'Payments', href: '/admin/payments', icon: CreditCard },
    { name: 'Settlements', href: '/admin/settlements', icon: Wallet },
    { name: 'Webhooks', href: '/admin/webhooks', icon: Webhook },
    { name: 'Config', href: '/admin/config', icon: Settings },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center gap-8">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'oklch(0.205 0 0)' }}>
                                    <ShieldCheck className="w-5 h-5 text-white" />
                                </div>
                                <span className="font-bold text-lg tracking-tight text-slate-900">FluxaPay Admin</span>
                            </div>

                            <nav className="hidden md:flex items-center gap-1">
                                {navigation.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                                ? 'bg-slate-100 text-slate-900'
                                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                                }`}
                                        >
                                            <item.icon className={`w-4 h-4 ${isActive ? 'text-slate-900' : 'text-slate-400'}`} />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="h-8 w-[1px] bg-slate-200" />
                            <div className="flex items-center gap-3">
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs font-bold text-slate-900 leading-none">Admin User</p>
                                    <p className="text-[10px] text-slate-500 mt-1 leading-none">Super Administrator</p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300" />
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="">
                {children}
            </main>
        </div>
    );
}
