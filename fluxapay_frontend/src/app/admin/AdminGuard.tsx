'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Client-side guard that redirects unauthenticated users away from /admin.
 * Checks for a JWT token in localStorage. Real role-based enforcement should
 * also be done server-side (middleware or server component) when auth is wired.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
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

    return <>{children}</>;
}
