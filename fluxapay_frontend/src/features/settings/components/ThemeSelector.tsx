"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/components/ThemeProvider";

interface ThemeSelectorProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  disabled?: boolean;
}

const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeSelector({ theme, onThemeChange, disabled = false }: ThemeSelectorProps) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium">Theme preference</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme preference">
        {options.map(({ value, label, Icon }) => (
          <label
            key={value}
            className={`flex min-h-20 items-center gap-3 rounded-md border p-4 text-left transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ${
              theme === value
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            <input
              type="radio"
              name="theme-preference"
              value={value}
              checked={theme === value}
              onChange={() => onThemeChange(value)}
              className="sr-only"
            />
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}