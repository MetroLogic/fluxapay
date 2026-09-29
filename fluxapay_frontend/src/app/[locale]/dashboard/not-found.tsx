import Link from "next/link";
import { LayoutDashboard, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/Button";
import { cn } from "@/lib/utils";

interface DashboardNotFoundProps {
    title?: string;
    message?: string;
    href?: string;
    linkLabel?: string;
}

export default function DashboardNotFound({
    title = "Page not found",
    message = "The page you are looking for does not exist within the dashboard.",
    href = "/dashboard",
    linkLabel = "Return to Overview",
}: DashboardNotFoundProps) {
    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                <SearchX className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-primary">FluxaPay Dashboard</p>
            <h1 className="mt-3 text-7xl font-bold leading-none text-foreground sm:text-8xl">
                404
            </h1>
            <h2 className="mt-4 text-xl font-semibold text-foreground sm:text-2xl">{title}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
                {message}
            </p>
            <Link
                href={href}
                className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-6 gap-2")}
            >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                {linkLabel}
            </Link>
        </div>
    );
}
