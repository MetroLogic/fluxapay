import { type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";

type State = "ready" | "loading" | "error" | "empty";

type Props = {
  colSpan: number;
  state: State;
  errorMessage?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  skeletonRows?: number;
  children: ReactNode;
};

/**
 * Single place for loading / error / empty row behavior inside a &lt;tbody&gt;.
 */
export function DataTableBodyState({
  colSpan,
  state,
  errorMessage = "Something went wrong. Try again.",
  emptyMessage = "No rows match your filters.",
  loadingMessage = "Loading…",
  skeletonRows = 5,
  children,
}: Props) {
  if (state === "loading") {
    return (
      <>
        <tr aria-busy="true" aria-live="polite">
          <td colSpan={colSpan} className="sr-only">
            {loadingMessage}
          </td>
        </tr>
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <tr key={index} aria-hidden="true">
            {Array.from({ length: colSpan }).map((_, cellIndex) => (
              <td key={cellIndex} className="p-2">
                <Skeleton className="h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }
  if (state === "error") {
    return (
      <tr>
        <td
          colSpan={colSpan}
          className="px-4 py-12 text-center text-destructive text-sm"
        >
          {errorMessage}
        </td>
      </tr>
    );
  }
  if (state === "empty") {
    return (
      <EmptyState
        colSpan={colSpan}
        className="px-4 py-12 text-muted-foreground"
        message={emptyMessage}
      />
    );
  }
  return <>{children}</>;
}
