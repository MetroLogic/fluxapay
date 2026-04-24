"use client";

import React, { useState, useEffect } from "react";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { api, ApiError, clearToken } from "@/lib/api";

import {
  Copy,
  Key,
  Webhook,
  Shield,
  CheckCircle2,
  CalendarClock,
  Clock,
  Palette,
} from "lucide-react";

export default function SettingsPage() {
  // Account Details State
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [settlementSchedule, setSettlementSchedule] = useState<
    "daily" | "weekly"
  >("daily");
  const [settlementDay, setSettlementDay] = useState<number>(1); // Default to Monday
  const [nextSettlementDate, setNextSettlementDate] = useState<string>("");

  // API Key State
  const [apiKey, setApiKey] = useState("Loading...");
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [keyRegenerated, setKeyRegenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  // Webhook State
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookError, setWebhookError] = useState("");
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);

  // Security State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);
  const [sessionNote, setSessionNote] = useState<string>("Current session active");

  // Hosted checkout branding
  const [checkoutLogoUrl, setCheckoutLogoUrl] = useState("");
  const [checkoutAccentColor, setCheckoutAccentColor] = useState("#2563eb");
  const [checkoutLogoError, setCheckoutLogoError] = useState("");
  const [checkoutBrandingSaved, setCheckoutBrandingSaved] = useState(false);
  const [isSavingCheckoutBranding, setIsSavingCheckoutBranding] =
    useState(false);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Load merchant data on mount
  useEffect(() => {
    loadMerchantData();
    setSessionNote(getSessionNote());
  }, []);

  const getSessionNote = () => {
    if (typeof window === "undefined") return "Current session active";

    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token");
    if (!token) return "No active session token found";

    try {
      const payloadSegment = token.split(".")[1];
      if (!payloadSegment) return "Current session active";

      const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
      const normalized = base64.padEnd(
        Math.ceil(base64.length / 4) * 4,
        "=",
      );
      const payload = JSON.parse(atob(normalized)) as { iat?: number };
      if (!payload.iat) return "Current session active";

      return `Last login: ${new Date(payload.iat * 1000).toLocaleString()}`;
    } catch {
      return "Current session active";
    }
  };

  const loadMerchantData = async () => {
    try {
      const response = await api.merchant.getMe();
      const merchant = response.merchant as Record<string, unknown>;

      setBusinessName((merchant.business_name as string) || "");
      setContactEmail((merchant.email as string) || "");
      setWebhookUrl((merchant.webhook_url as string) || "");
      setApiKey((merchant.api_key as string) || "No API key generated");
      setSettlementSchedule(
        (merchant.settlement_schedule as "daily" | "weekly") || "daily",
      );
      setSettlementDay((merchant.settlement_day as number) ?? 1);

      setCheckoutLogoUrl(
        typeof merchant.checkout_logo_url === "string"
          ? merchant.checkout_logo_url
          : "",
      );
      setCheckoutAccentColor(
        typeof merchant.checkout_accent_color === "string" &&
          merchant.checkout_accent_color
          ? merchant.checkout_accent_color
          : "#2563eb",
      );
      setCheckoutLogoError("");

      // Fetch settlement summary for next settlement date
      try {
        const summary = await api.settlements.summary();
        if (summary.next_settlement_date) {
          setNextSettlementDate(summary.next_settlement_date);
        }
      } catch (err) {
        console.error("Failed to load settlement summary:", err);
      }
    } catch (error) {
      console.error("Failed to load merchant data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Account Details Save
  const handleAccountSave = async () => {
    setIsSavingAccount(true);
    setAccountError("");
    
    try {
      await api.merchant.updateProfile({
        business_name: businessName,
        email: contactEmail,
        settlement_schedule: settlementSchedule,
        settlement_day:
          settlementSchedule === "weekly" ? settlementDay : undefined,
      });
      
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 3000);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to save changes";
      setAccountError(message);
      console.error("Failed to save account details:", error);
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleCheckoutLogoChange = (value: string) => {
    setCheckoutLogoUrl(value);
    const v = value.trim();
    if (v && !v.startsWith("https://")) {
      setCheckoutLogoError("Logo URL must start with https://");
    } else {
      setCheckoutLogoError("");
    }
  };

  const handleCheckoutBrandingSave = async () => {
    if (checkoutLogoError) return;
    setIsSavingCheckoutBranding(true);
    try {
      await api.merchant.updateProfile({
        checkout_logo_url:
          checkoutLogoUrl.trim() === "" ? null : checkoutLogoUrl.trim(),
        checkout_accent_color: checkoutAccentColor || null,
      });
      setCheckoutBrandingSaved(true);
      setTimeout(() => setCheckoutBrandingSaved(false), 3000);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to save branding";
      setCheckoutLogoError(message);
    } finally {
      setIsSavingCheckoutBranding(false);
    }
  };

  // Handle API Key Copy
  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle API Key Regeneration
  const handleRegenerateApiKey = async () => {
    setIsRegenerating(true);
    
    try {
      const response = await api.keys.regenerate();
      setApiKey(response.api_key);
      
      setShowRegenerateModal(false);
      setKeyRegenerated(true);
      setTimeout(() => setKeyRegenerated(false), 5000);
    } catch (error) {
      console.error("Failed to regenerate API key:", error);
      alert("Failed to regenerate API key. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  // Handle Webhook URL Change
  const handleWebhookUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWebhookUrl(value);

    // Validate HTTPS
    if (value && !value.startsWith("https://")) {
      setWebhookError("Webhook URL must start with https://");
    } else {
      setWebhookError("");
    }
  };

  // Handle Webhook Save
  const handleWebhookSave = async () => {
    if (webhookError) return;
    setIsSavingWebhook(true);
    
    try {
      await api.merchant.updateWebhook(webhookUrl);
      
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 3000);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Failed to save webhook URL";
      setWebhookError(message);
      console.error("Failed to save webhook URL:", error);
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleSignOutCurrentSession = () => {
    setIsSigningOut(true);
    clearToken();
    window.location.href = "/login";
  };

  const handleSignOutAllSessions = async () => {
    setIsSigningOutAll(true);
    try {
      await api.auth.logoutAllSessions();
    } catch (error) {
      // Backend support is optional; still clear local session.
      if (error instanceof ApiError && error.status !== 404) {
        console.error("Logout-all request failed:", error);
      }
    } finally {
      clearToken();
      window.location.href = "/login";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <svg
            className="h-8 w-8 animate-spin mx-auto mb-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <circle cx="12" cy="12" r="10" className="opacity-30" />
            <path d="M22 12a10 10 0 0 1-10 10" />
          </svg>
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">
            Manage your account preferences and configurations.
          </p>
        </div>
      </div>

      {/* Account Details Section */}
      <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
        <div className="flex items-center gap-2 text-primary font-semibold mb-4">
          <Shield className="h-5 w-5" />
          <h3 className="text-lg">Account Details</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Business Name
            </label>
            <Input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Enter your business name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Contact Email
            </label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contact@example.com"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="dark"
              onClick={handleAccountSave}
              disabled={isSavingAccount}
              className="gap-2"
            >
              {isSavingAccount && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle cx="12" cy="12" r="10" className="opacity-30" />
                  <path d="M22 12a10 10 0 0 1-10 10" />
                </svg>
              )}
              {accountSaved && <CheckCircle2 className="h-4 w-4" />}
              {isSavingAccount
                ? "Saving..."
                : accountSaved
                  ? "Saved!"
                  : "Save Changes"}
            </Button>
          </div>

          {accountError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
              <p className="text-sm">{accountError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Hosted checkout branding */}
      <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
        <div className="flex items-center gap-2 text-primary font-semibold mb-4">
          <Palette className="h-5 w-5" />
          <h3 className="text-lg">Hosted checkout</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Logo and accent color appear on your customer-facing payment page
          (<code className="text-xs">/pay/…</code>). If the logo fails to load,
          customers see your business initial instead.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Logo URL</label>
            <Input
              type="url"
              value={checkoutLogoUrl}
              onChange={(e) => handleCheckoutLogoChange(e.target.value)}
              placeholder="https://cdn.example.com/logo.png"
              error={checkoutLogoError}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Must be a public <span className="font-medium">https</span> image
              URL (PNG, SVG, or WebP recommended).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Primary accent color
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(checkoutAccentColor)
                    ? checkoutAccentColor
                    : "#2563eb"
                }
                onChange={(e) => setCheckoutAccentColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-input bg-background"
                aria-label="Pick accent color"
              />
              <Input
                type="text"
                value={checkoutAccentColor}
                onChange={(e) => setCheckoutAccentColor(e.target.value)}
                placeholder="#2563eb"
                className="max-w-[140px] font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Hex format: <code className="text-xs">#RRGGBB</code> or{" "}
              <code className="text-xs">#RGB</code>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="dark"
              onClick={handleCheckoutBrandingSave}
              disabled={!!checkoutLogoError || isSavingCheckoutBranding}
              className="gap-2"
            >
              {isSavingCheckoutBranding && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle cx="12" cy="12" r="10" className="opacity-30" />
                  <path d="M22 12a10 10 0 0 1-10 10" />
                </svg>
              )}
              {checkoutBrandingSaved && <CheckCircle2 className="h-4 w-4" />}
              {isSavingCheckoutBranding
                ? "Saving…"
                : checkoutBrandingSaved
                  ? "Saved!"
                  : "Save checkout appearance"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCheckoutLogoUrl("");
                setCheckoutAccentColor("#2563eb");
                setCheckoutLogoError("");
              }}
            >
              Reset to defaults
            </Button>
          </div>
        </div>
      </div>

      {/* Settlement Schedule Section */}
      <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
        <div className="flex items-center gap-2 text-primary font-semibold mb-4">
          <CalendarClock className="h-5 w-5" />
          <h3 className="text-lg">Settlement Schedule</h3>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Schedule Frequency
              </label>
              <select
                value={settlementSchedule}
                onChange={(e) =>
                  setSettlementSchedule(e.target.value as "daily" | "weekly")
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            {settlementSchedule === "weekly" && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Settlement Day
                </label>
                <select
                  value={settlementDay}
                  onChange={(e) => setSettlementDay(parseInt(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                </select>
              </div>
            )}
          </div>

          {nextSettlementDate && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <Clock className="h-4 w-4" />
                <span>
                  Next Scheduled Settlement:{" "}
                  {new Date(nextSettlementDate).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="dark"
              onClick={handleAccountSave}
              disabled={isSavingAccount}
              className="gap-2"
            >
              {isSavingAccount && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle cx="12" cy="12" r="10" className="opacity-30" />
                  <path d="M22 12a10 10 0 0 1-10 10" />
                </svg>
              )}
              {accountSaved && <CheckCircle2 className="h-4 w-4" />}
              {isSavingAccount ? "Saving..." : "Update Schedule"}
            </Button>
          </div>
        </div>
      </div>

      {/* API Keys Section */}
      <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
        <div className="flex items-center gap-2 text-primary font-semibold mb-4">
          <Key className="h-5 w-5" />
          <h3 className="text-lg">API Keys</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Live API Key
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={apiKey}
                readOnly
                className="font-mono text-sm bg-muted/50"
              />
              <Button
                variant="outline"
                onClick={handleCopyApiKey}
                className="gap-2 shrink-0"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Keep your API key secure. Do not share it publicly.
            </p>
          </div>

          <div className="pt-2">
            <Button
              variant="destructive"
              onClick={() => setShowRegenerateModal(true)}
            >
              Regenerate API Key
            </Button>
          </div>

          {/* Success Message */}
          {keyRegenerated && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-sm font-medium">
                API key regenerated successfully! Make sure to update your
                integrations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Webhook Configuration Section */}
      <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
        <div className="flex items-center gap-2 text-primary font-semibold mb-4">
          <Webhook className="h-5 w-5" />
          <h3 className="text-lg">Webhook Configuration</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Webhook URL
            </label>
            <Input
              type="url"
              value={webhookUrl}
              onChange={handleWebhookUrlChange}
              placeholder="https://your-domain.com/webhooks"
              error={webhookError}
            />
            <p className="text-xs text-muted-foreground mt-2">
              We&apos;ll send payment notifications to this endpoint.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="dark"
              onClick={handleWebhookSave}
              disabled={!!webhookError || isSavingWebhook}
              className="gap-2"
            >
              {isSavingWebhook && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle cx="12" cy="12" r="10" className="opacity-30" />
                  <path d="M22 12a10 10 0 0 1-10 10" />
                </svg>
              )}
              {webhookSaved && <CheckCircle2 className="h-4 w-4" />}
              {isSavingWebhook
                ? "Saving..."
                : webhookSaved
                  ? "Saved!"
                  : "Save Webhook URL"}
            </Button>
          </div>

          {webhookError && !webhookError.includes("https://") && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
              <p className="text-sm">{webhookError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Security Settings Section */}
      <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
        <div className="flex items-center gap-2 text-primary font-semibold mb-4">
          <Shield className="h-5 w-5" />
          <h3 className="text-lg">Security Settings</h3>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border bg-background p-4">
            <p className="font-medium">Session status</p>
            <p className="text-sm text-muted-foreground mt-1">{sessionNote}</p>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border bg-background">
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security to your account
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={twoFactorEnabled}
                onChange={(e) => setTwoFactorEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#5649DF]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5649DF]"></div>
            </label>
          </div>

          <div className="rounded-lg border bg-background p-4 space-y-3">
            <div>
              <p className="font-medium">Session controls</p>
              <p className="text-sm text-muted-foreground">
                Sign out this device or invalidate all active sessions.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={handleSignOutCurrentSession}
                disabled={isSigningOut || isSigningOutAll}
              >
                {isSigningOut ? "Signing out..." : "Sign out this session"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleSignOutAllSessions}
                disabled={isSigningOut || isSigningOutAll}
              >
                {isSigningOutAll ? "Signing out..." : "Sign out all sessions"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Regeneration Modal */}
      <Modal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        title="Regenerate API Key"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to regenerate your API key? Your current API
            key will be immediately invalidated and any integrations using it
            will stop working.
          </p>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowRegenerateModal(false)}
              className="flex-1"
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRegenerateApiKey}
              className="flex-1 gap-2"
              disabled={isRegenerating}
            >
              {isRegenerating && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle cx="12" cy="12" r="10" className="opacity-30" />
                  <path d="M22 12a10 10 0 0 1-10 10" />
                </svg>
              )}
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
