"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  theme: ThemePreference;
  isDark: boolean;
  isMounted: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [theme, setThemePreference] = useState<ThemePreference>("system");

  const applyTheme = useCallback((preference: ThemePreference) => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedIsDark = preference === "dark" || (preference === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", resolvedIsDark);
    document.documentElement.style.colorScheme = resolvedIsDark ? "dark" : "light";
    setIsDark(resolvedIsDark);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const preference: ThemePreference =
      savedTheme === "light" || savedTheme === "dark" || savedTheme === "system"
        ? savedTheme
        : "system";
    setThemePreference(preference);
    applyTheme(preference);
    setIsMounted(true);
  }, [applyTheme]);

  useEffect(() => {
    if (!isMounted) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (theme !== "system") return;

    const handleSystemThemeChange = () => applyTheme("system");
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [applyTheme, theme, isMounted]);

  const toggleTheme = () => {
    if (!isMounted) return;
    setTheme(isDark ? "light" : "dark");
  };

  const setTheme = (value: ThemePreference) => {
    if (!isMounted) return;
    localStorage.setItem("theme", value);
    setThemePreference(value);
    applyTheme(value);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, isMounted, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
