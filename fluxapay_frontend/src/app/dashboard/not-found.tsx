import Link from "next/link";
// Using button variants since explicit Button component might have asChild issues or we want direct control
import { buttonVariants } from "@/components/Button";
import { cn } from "@/lib/utils";

export default function DashboardNotFound() {
    return (
        <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-3xl font-bold tracking-tight">404 - Page Not Found</h2>
            <p className="text-muted-foreground max-w-md">
                The page you are looking for does not exist within the dashboard.
            </p>
            <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "default" }))}
            >
                Return to Overview
            </Link>
        </div>
    );
}
