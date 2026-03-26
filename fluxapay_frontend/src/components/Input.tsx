import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, label, id, ...props }, ref) => {
    // Generate a unique ID for the input if one isn't provided
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-700"
          >
            {label}
          </label>
        )
        }
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "w-full rounded-[10px] border px-4 py-3 text-sm text-slate-900 outline-none transition bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#5649DF] focus:border-[#5649DF]",
            error ? "border-red-500" : "border-[#D9D9D9]",
            className
          )}
          {...props}
        />
        {error && (
          <span className="mt-2 block text-xs text-red-500 animate-slide-down">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;

