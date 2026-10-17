"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Link2,
  Copy,
  Check,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Edit,
  X,
  QrCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentLink } from "@/lib/links";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";

export function PaymentLinksPage() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [description, setDescription] = useState("");
  const [expiry, setExpiry] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showQR, setShowQR] = useState<PaymentLink | null>(null);
  const [editingLink, setEditingLink] = useState<PaymentLink | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const [editMaxUses, setEditMaxUses] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/links");
      if (!res.ok) throw new Error("Failed to load payment links");
      setLinks(await res.json());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load payment links");
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label || !amount) return;
    setCreating(true);
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        amount: parseFloat(amount),
        currency,
        description: description || undefined,
        expiry: expiry || undefined,
        max_uses: maxUses ? parseInt(maxUses) : undefined,
      }),
    });
    const newLink = await res.json();
    setLabel("");
    setAmount("");
    setCurrency("USD");
    setDescription("");
    setExpiry("");
    setMaxUses("");
    setCreating(false);
    setShowQR(newLink);
    void load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this payment link?")) return;
    await fetch(`/api/links/${id}`, { method: "DELETE" });
    void load();
  }

  async function handleToggle(id: string) {
    await fetch(`/api/links/${id}`, { method: "PATCH" });
    void load();
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/api/links/${slug}/click`;
    navigator.clipboard.writeText(url);
    setCopied(slug);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  }

  function shareLink(slug: string, label: string) {
    const url = `${window.location.origin}/api/links/${slug}/click`;
    if (navigator.share) {
      void navigator.share({ title: label, url });
    } else {
      copyLink(slug);
    }
  }

  const convRate = (link: PaymentLink) =>
    link.clicks === 0
      ? "—"
      : `${((link.conversions / link.clicks) * 100).toFixed(1)}%`;

  function openEditModal(link: PaymentLink) {
    setEditingLink(link);
    setEditDescription(link.description || "");
    setEditExpiry(link.expiry || "");
    setEditMaxUses(link.max_uses ? String(link.max_uses) : "");
  }

  async function handleSaveEdit() {
    if (!editingLink) return;
    await fetch(`/api/links/${editingLink.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: editDescription || undefined,
        expiry: editExpiry || undefined,
        max_uses: editMaxUses ? parseInt(editMaxUses) : undefined,
      }),
    });
    setEditingLink(null);
    void load();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Payment Links</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create shareable links for quick checkout via social commerce,
          WhatsApp, or email.
        </p>
      </div>

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <input
          type="text"
          placeholder="Link label (e.g. Product A)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          min="0.01"
          step="0.01"
          className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="datetime-local"
          placeholder="Expiry (optional)"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="number"
          placeholder="Max uses (optional)"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          min="1"
          className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:col-span-2 xl:col-span-1"
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {creating ? "Creating…" : "Create Link"}
        </button>
      </form>

      {/* Stats summary */}
      {links.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Links", value: links.length },
            { label: "Active", value: links.filter((l) => l.active).length },
            {
              label: "Total Clicks",
              value: links.reduce((s, l) => s + l.clicks, 0),
            },
            {
              label: "Conversions",
              value: links.reduce((s, l) => s + l.conversions, 0),
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-card p-4"
            >
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Payment Link Created</h3>
              <button
                onClick={() => setShowQR(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="bg-white p-4 rounded-lg border">
                <QRCodeSVG
                  value={`${window.location.origin}/api/links/${showQR.slug}/click`}
                  size={200}
                />
              </div>
              <div className="w-full">
                <p className="text-sm text-gray-600 mb-1">Shareable URL:</p>
                <div className="flex min-w-0 gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/api/links/${showQR.slug}/click`}
                    className="w-full min-w-0 rounded border bg-gray-50 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => copyLink(showQR.slug)}
                    className="shrink-0 rounded bg-primary px-3 py-2 text-white hover:bg-primary/90"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingLink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Edit Payment Link</h3>
              <button
                onClick={() => setEditingLink(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expiry</label>
                <input
                  type="datetime-local"
                  value={editExpiry}
                  onChange={(e) => setEditExpiry(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Max Uses
                </label>
                <input
                  type="number"
                  value={editMaxUses}
                  onChange={(e) => setEditMaxUses(e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setEditingLink(null)}
                  className="w-full rounded border px-4 py-2 hover:bg-gray-50 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="w-full rounded bg-primary px-4 py-2 text-white hover:bg-primary/90 sm:w-auto"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table / loading / empty */}
      {loading ? (
        <div
          className="rounded-lg border border-border p-12 text-center"
          data-testid="payment-links-skeleton"
          aria-hidden="true"
        >
          <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-muted mb-3" />
          <div className="mx-auto h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-red-700">
          <p className="font-medium">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 text-sm underline"
          >
            Retry
          </button>
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Link2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No payment links yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create one above to get started.
          </p>
        </div>
      ) : (
        <div className="mb-3 grid gap-3 md:hidden" data-testid="payment-links-mobile-list">
          {links.map((link) => (
            <article key={link.id} className={cn("min-w-0 rounded-lg border border-border bg-card p-4", !link.active && "opacity-60")}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{link.label}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">{link.slug}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    link.active
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {link.active ? "Active" : "Inactive"}
                </span>
              </div>
              {link.description && (
                <p className="mt-2 break-words text-sm text-muted-foreground">{link.description}</p>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Amount</dt>
                  <dd>${link.amount.toFixed(2)} {link.currency}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Created</dt>
                  <dd>{new Date(link.created_at).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Clicks</dt>
                  <dd>{link.clicks}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Conversions / Rate</dt>
                  <dd>{link.conversions} / {convRate(link)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-border pt-2">
                <button onClick={() => copyLink(link.slug)} aria-label={`Copy link for ${link.label}`} title="Copy link" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  {copied === link.slug ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <button onClick={() => shareLink(link.slug, link.label)} aria-label={`Share link for ${link.label}`} title="Share link" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button onClick={() => setShowQR(link)} aria-label={`Show QR code for ${link.label}`} title="Show QR code" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <QrCode className="h-4 w-4" />
                </button>
                <button onClick={() => openEditModal(link)} aria-label={`Edit ${link.label}`} title="Edit" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <Edit className="h-4 w-4" />
                </button>
                <button onClick={() => handleToggle(link.id)} aria-label={link.active ? `Deactivate ${link.label}` : `Activate ${link.label}`} title={link.active ? "Deactivate" : "Activate"} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  {link.active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                </button>
                <button onClick={() => handleDelete(link.id)} aria-label={`Delete link for ${link.label}`} title="Delete" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Clicks</th>
                <th className="px-4 py-3 font-medium text-right">Conv.</th>
                <th className="px-4 py-3 font-medium text-right">Rate</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {links.map((link) => (
                <tr
                  key={link.id}
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    !link.active && "opacity-60",
                  )}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{link.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {link.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {link.description || "—"}
                  </td>
                  <td className="px-4 py-3">
                    ${link.amount.toFixed(2)} {link.currency}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        link.active
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {link.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(link.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">{link.clicks}</td>
                  <td className="px-4 py-3 text-right">{link.conversions}</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right",
                      link.clicks > 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {convRate(link)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Copy */}
                      <button
                        onClick={() => copyLink(link.slug)}
                        aria-label={`Copy link for ${link.label}`}
                        title="Copy link"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {copied === link.slug ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {/* Share */}
                      <button
                        onClick={() => shareLink(link.slug, link.label)}
                        aria-label={`Share link for ${link.label}`}
                        title="Share link"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      {/* QR Code */}
                      <button
                        onClick={() => setShowQR(link)}
                        aria-label={`Show QR code for ${link.label}`}
                        title="Show QR code"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                      </button>
                      {/* Edit */}
                      <button
                        onClick={() => openEditModal(link)}
                        aria-label={`Edit ${link.label}`}
                        title="Edit"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      {/* Toggle active */}
                      <button
                        onClick={() => handleToggle(link.id)}
                        aria-label={
                          link.active
                            ? `Deactivate ${link.label}`
                            : `Activate ${link.label}`
                        }
                        title={link.active ? "Deactivate" : "Activate"}
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {link.active ? (
                          <ToggleRight className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <ToggleLeft className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(link.id)}
                        aria-label={`Delete link for ${link.label}`}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
