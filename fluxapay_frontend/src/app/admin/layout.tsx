export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
                <div className="font-bold text-xl">FluxaPay Admin</div>
                <div className="text-sm text-muted-foreground">Administrator</div>
            </header>
            <main className="bg-muted/30 min-h-[calc(100vh-65px)]">
                {children}
            </main>
        </div>
    );
}
