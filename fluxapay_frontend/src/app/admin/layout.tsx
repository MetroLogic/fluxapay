import { AdminSidebar } from '../../features/admin/payments/components/AdminSidebar';
import AdminGuard from './AdminGuard';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AdminGuard>
            <div className="flex min-h-screen bg-slate-50">
                {/* Sidebar component handles its own responsive visibility */}
                <AdminSidebar />

                {/* Main Content Area */}
                <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 md:p-8">
                        {/* Added a spacer for mobile so content isn't hidden under the toggle button */}
                        <div className="h-12 lg:hidden" />
                        {children}
                    </div>
                </main>
            </div>
        </AdminGuard>
    );
}