"use client";

import { useEffect, useState } from "react";
import { Link2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentLink = {
  id: string;
  slug: string;
  label: string;
  amount: number;
  currency: string;
  created_at: string;
  clicks: number;
  conversions: number;
};

export function PaymentLinksPage() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/links");
    setLinks(await res.json());
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label || !amount) return;
    setCreating(true);
    await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, amount: parseFloat(amount) }),
    });
    setLabel("");
    setAmount("");
    setCreating(false);
    load();
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/api/links/${slug}/click`);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  }

  const convRate = (link: PaymentLink) =>
    link.clicks === 0 ? "—" : `${((link.conversions / link.clicks) * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="flex flex-wrap gap-3 p-4 rounded-lg border border-border bg-card"
      >
        <input
          type="text"
          placeholder="Link label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="flex-1 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="number"
          placeholder="Amount (USD)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          min="0"
          step="0.01"
          className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={creating}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          Create Link
        </button>
      </form>

      {/* Table */}
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payment links yet. Create one above.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Clicks</th>
                <th className="px-4 py-3 font-medium text-right">Conversions</th>
                <th className="px-4 py-3 font-medium text-right">Conv. Rate</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {links.map((link) => (
                <tr key={link.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{link.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{link.slug}</td>
                  <td className="px-4 py-3">${link.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(link.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">{link.clicks}</td>
                  <td className="px-4 py-3 text-right">{link.conversions}</td>
                  <td className={cn("px-4 py-3 text-right", link.clicks > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                    {convRate(link)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => copyLink(link.slug)}
                      aria-label={`Copy link for ${link.label}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied === link.slug ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
