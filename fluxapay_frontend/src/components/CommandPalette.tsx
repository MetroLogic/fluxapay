"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { isAdmin } from "@/lib/auth";

const BASE_ROUTES = [
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
];

const ADMIN_ROUTES = [
  { label: "Admin Overview", path: "/admin/overview" },
  { label: "Force Oracle Sync", path: "/admin/overview?action=force-oracle-sync" },
  { label: "Flush Webhook Queue", path: "/admin/overview?action=flush-webhooks" },
  { label: "View KYC Queue", path: "/admin/overview?action=kyc-queue" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const routes = isAdminUser ? [...BASE_ROUTES, ...ADMIN_ROUTES] : BASE_ROUTES;

  // Initialize admin status
  useEffect(() => {
    setIsAdminUser(isAdmin());
  }, []);

  const filtered = routes.filter((r) =>
    r.label.toLowerCase().includes(query.toLowerCase())
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const saveSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const prev: string[] = (() => {
      try { return JSON.parse(sessionStorage.getItem("commandPaletteSearches") ?? "[]"); }
      catch { return []; }
    })();
    const updated = [searchQuery, ...prev.filter((s) => s !== searchQuery)].slice(0, 10);
    sessionStorage.setItem("commandPaletteSearches", JSON.stringify(updated));
  }, []);

  const navigate = useCallback(
    (path: string) => {
      if (query.trim()) {
        saveSearch(query);
      }
      close();
      router.push(path);
    },
    [close, router, query, saveSearch]
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

  /**
   * Focus trap (#834).
   *
   * The previous implementation listened for Escape and otherwise called
   * `e.preventDefault()` on every Tab. That is not a trap — it disables Tab
   * outright, so focus cannot move *within* the palette either, and the moment
   * focus sat anywhere but the input, Tab escaped to the dashboard behind it.
   *
   * This cycles focus across the palette's own focusable elements and wraps at
   * both ends, so Tab and Shift+Tab stay inside while remaining useful.
   */
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;

    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;

      // Recomputed per keypress: the result list re-renders as the query
      // changes, so a list captured on open would immediately go stale.
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  /**
   * Hide the background from assistive tech while the palette is open (#834),
   * and restore focus to whatever opened it on close.
   *
   * `inert` is set alongside `aria-hidden` because aria-hidden alone still
   * leaves background controls clickable and focusable by pointer — it hides
   * them from screen readers without actually making them inert.
   */
  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement as HTMLElement | null;
    const root = document.getElementById("__next") ?? document.body;
    const siblings = Array.from(root.children).filter(
      (el) => el !== dialogRef.current && !el.contains(dialogRef.current),
    ) as HTMLElement[];

    for (const el of siblings) {
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("inert", "");
    }

    const id = requestAnimationFrame(() => {
      setActive(0);
      queueMicrotask(() => inputRef.current?.focus());
    });

    return () => {
      cancelAnimationFrame(id);
      for (const el of siblings) {
        el.removeAttribute("aria-hidden");
        el.removeAttribute("inert");
      }
      // Returning focus to the trigger is what stops a keyboard user being
      // dumped at the top of the document every time they dismiss the palette.
      if (opener?.isConnected) opener.focus();
    };
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
    }
  };

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      aria-live="polite"
      aria-busy={filtered.length === 0 && query.length > 0}
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
          <p className="px-4 py-3 text-sm text-muted-foreground" role="status">
            {query ? "No results." : "Type to search…"}
          </p>
        )}
      </div>
    </div>
  );
}
