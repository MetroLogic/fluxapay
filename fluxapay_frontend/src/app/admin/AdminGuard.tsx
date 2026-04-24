'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldOff } from 'lucide-react';

const ADMIN_ENABLED = process.env.NEXT_PUBLIC_ADMIN_ENABLED === 'true';

/**
 * Client-side guard that:
 *  1. Blocks all admin pages when NEXT_PUBLIC_ADMIN_ENABLED is not 'true' — prevents
 *     accidental exposure in environments where the admin secret is not configured.
 *  2. Redirects unauthenticated users to /login.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (!ADMIN_ENABLED) {
            // Admin is not configured — stop here; don't touch localStorage or redirect.
            setChecked(true);
            return;
        }

        const token = localStorage.getItem('token');
        const isAdmin = localStorage.getItem('isAdmin');

        if (!token || isAdmin !== 'true') {
            router.replace('/login');
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage requires post-mount effect
        setChecked(true);
    }, [router]);

    if (!checked) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
            </div>
        );
    }

    if (!ADMIN_ENABLED) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 text-center px-4">
                <ShieldOff className="w-12 h-12 text-slate-400" />
                <h1 className="text-2xl font-semibold text-slate-700">Admin not enabled</h1>
                <p className="text-slate-500 max-w-sm">
                    The admin dashboard is not configured for this environment. Set{' '}
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-sm font-mono">
                        NEXT_PUBLIC_ADMIN_ENABLED=true
                    </code>{' '}
                    to enable it.
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
