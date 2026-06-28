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
    const res = await fetch("/api/links");
    setLinks(await res.json());
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
        className="flex flex-wrap gap-3 p-4 rounded-lg border border-border bg-card"
      >
        <input
          type="text"
          placeholder="Link label (e.g. Product A)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="flex-1 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          min="0.01"
          step="0.01"
          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
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
          className="flex-1 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="datetime-local"
          placeholder="Expiry (optional)"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="number"
          placeholder="Max uses (optional)"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          min="1"
          className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={creating}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
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
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/api/links/${showQR.slug}/click`}
                    className="flex-1 px-3 py-2 border rounded bg-gray-50 text-sm"
                  />
                  <button
                    onClick={() => copyLink(showQR.slug)}
                    className="px-3 py-2 bg-primary text-white rounded hover:bg-primary/90"
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
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
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
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setEditingLink(null)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Link2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No payment links yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create one above to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
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
