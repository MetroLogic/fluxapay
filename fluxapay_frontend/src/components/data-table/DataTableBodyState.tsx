import { type ReactNode } from "react";
import EmptyState from "@/components/EmptyState";

type State = "ready" | "loading" | "error" | "empty";

type Props = {
  colSpan: number;
  state: State;
  errorMessage?: string;
  emptyMessage?: string;
  loadingMessage?: string;
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
  children,
}: Props) {
  if (state === "loading") {
    return (
      <tr>
        <td
          colSpan={colSpan}
          className="px-4 py-16 text-center text-muted-foreground"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <span
              className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"
              aria-hidden
            />
            {loadingMessage}
          </span>
        </td>
      </tr>
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
