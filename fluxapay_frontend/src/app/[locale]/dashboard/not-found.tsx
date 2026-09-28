import Link from "next/link";
// Using button variants since explicit Button component might have asChild issues or we want direct control
import { buttonVariants } from "@/components/Button";
import { cn } from "@/lib/utils";

interface DashboardNotFoundProps {
    title?: string;
    message?: string;
    href?: string;
    linkLabel?: string;
}

export default function DashboardNotFound({
    title = "404 - Page Not Found",
    message = "The page you are looking for does not exist within the dashboard.",
    href = "/dashboard",
    linkLabel = "Return to Overview",
}: DashboardNotFoundProps) {
    return (
        <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
            <p className="text-muted-foreground max-w-md">
                {message}
            </p>
            <Link
                href={href}
                className={cn(buttonVariants({ variant: "default" }))}
            >
                {linkLabel}
            </Link>
        </div>
    );
}
