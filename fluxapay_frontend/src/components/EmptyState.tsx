import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  message: string;
  colSpan?: number;
  className?: string;
}

const EmptyState = ({ message, colSpan = 1, className }: EmptyStateProps) => (
  <tr>
    <td colSpan={colSpan} className={cn("text-center text-sm text-slate-500", className)}>
      {message}
    </td>
  </tr>
);

export default EmptyState;
