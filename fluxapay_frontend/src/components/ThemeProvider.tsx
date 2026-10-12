"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";

interface ThemeContextType {
  isDark: boolean;
  isMounted: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Get initial theme from localStorage or system preference
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setIsDark(savedTheme === "dark");
    } else {
      // Check system preference on first visit
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(prefersDark);
    }
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    // Update HTML element class and localStorage
    const htmlElement = document.documentElement;
    if (isDark) {
      htmlElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      htmlElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark, isMounted]);

  const toggleTheme = () => {
    if (!isMounted) return;
    setIsDark(prev => !prev);
  };

  const setTheme = (value: boolean) => {
    if (!isMounted) return;
    setIsDark(value);
  };

  return (
    <ThemeContext.Provider value={{ isDark, isMounted, toggleTheme, setTheme }}>
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
