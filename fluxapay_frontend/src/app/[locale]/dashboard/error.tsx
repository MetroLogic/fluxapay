"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/Button";
import { cn } from "@/lib/utils";

/**
 * app/dashboard/error.tsx — error boundary scoped to the merchant dashboard.
 * Renders inside the DashboardShell so the sidebar/nav remain visible.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
      <div className="text-6xl font-extrabold tracking-tight text-foreground">
        500
      </div>
      <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
      <p className="text-muted-foreground max-w-md">
        An unexpected error occurred while loading this page. You can try again
        or return to the dashboard overview.
        {error.digest && (
          <span className="block mt-1 text-xs opacity-60">
            Error ID: {error.digest}
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={reset}
          className={cn(buttonVariants({ variant: "default" }))}
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Return to Overview
        </Link>
        <Link
          href="/support"
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          Contact Support
        </Link>
      </div>
    </div>
  );
}
