"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const ROUTES = [
  { label: "Overview", path: "/dashboard" },
  { label: "Payments", path: "/dashboard/payments" },
  { label: "Payment Links", path: "/dashboard/payment-links" },
  { label: "Invoices", path: "/dashboard/invoices" },
  { label: "Refunds", path: "/dashboard/refunds" },
  { label: "Settlements", path: "/dashboard/settlements" },
  { label: "Webhooks", path: "/dashboard/webhooks" },
  { label: "Analytics", path: "/dashboard/analytics" },
  { label: "Settings", path: "/dashboard/settings" },
  { label: "Developers", path: "/dashboard/developers" },
  { label: "Admin", path: "/admin/overview" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();

  const filtered = ROUTES.filter((r) =>
    r.label.toLowerCase().includes(query.toLowerCase())
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const navigate = useCallback(
    (path: string) => {
      close();
      router.push(path);
    },
    [close, router]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const item = listRef.current?.children[active] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" && filtered[active]) {
      navigate(filtered[active].path);
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-controls="cp-listbox"
            aria-activedescendant={filtered[active] ? `cp-item-${active}` : undefined}
            placeholder="Go to…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            className="w-full py-3 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex shrink-0 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {filtered.length > 0 ? (
          <ul
            id="cp-listbox"
            role="listbox"
            ref={listRef}
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.map((route, i) => (
              <li
                key={route.path}
                id={`cp-item-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={() => navigate(route.path)}
                className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                  i === active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {route.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">No results.</p>
        )}
      </div>
    </div>
  );
}
