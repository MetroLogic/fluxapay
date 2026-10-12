"use client";

import React, { useEffect, useState } from "react";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { api, ApiError } from "@/lib/api";
import { CheckCircle2, Palette } from "lucide-react";
import { Spinner } from "./Spinner";
import type { OnDirtyChange, SaveState } from "./types";

interface Props {
  initialLogoUrl: string;
  initialAccentColor: string;
  onDirtyChange: OnDirtyChange;
}

export function CheckoutBrandingSection({
  initialLogoUrl,
  initialAccentColor,
  onDirtyChange,
}: Props) {
  const [checkoutLogoUrl, setCheckoutLogoUrl] = useState(initialLogoUrl);
  const [checkoutAccentColor, setCheckoutAccentColor] = useState(initialAccentColor);
  const [checkoutLogoError, setCheckoutLogoError] = useState("");
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  const dirty =
    checkoutLogoUrl.trim() !== initialLogoUrl.trim() ||
    (checkoutAccentColor.trim() || "#2563eb") !== (initialAccentColor.trim() || "#2563eb");

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const handleLogoChange = (value: string) => {
    setCheckoutLogoUrl(value);
    const v = value.trim();
    if (v && !v.startsWith("https://")) {
      setCheckoutLogoError("Logo URL must start with https://");
    } else {
      setCheckoutLogoError("");
    }
  };

  const handleSave = async () => {
    if (checkoutLogoError) return;
    setSave({ status: "saving" });
    try {
      await api.merchant.updateProfile({
        checkout_logo_url:
          checkoutLogoUrl.trim() === "" ? null : checkoutLogoUrl.trim(),
        checkout_accent_color: checkoutAccentColor || null,
      });
      setSave({ status: "saved" });
      onDirtyChange(false);
      setTimeout(() => setSave({ status: "idle" }), 3000);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to save branding";
      setCheckoutLogoError(message);
      setSave({ status: "idle" });
    }
  };

  const saving = save.status === "saving";
  const saved = save.status === "saved";

  return (
    <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
        <Palette className="h-5 w-5" />
        <h3 className="text-lg">Hosted Checkout</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Logo and accent color appear on your customer-facing payment page (
        <code className="text-xs">/pay/...</code>).
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Logo URL</label>
          <Input
            type="url"
            value={checkoutLogoUrl}
            onChange={(e) => handleLogoChange(e.target.value)}
            placeholder="https://cdn.example.com/logo.png"
            error={checkoutLogoError}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Must be a public <span className="font-medium">https</span> image URL.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Primary Accent Color</label>
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
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            variant="dark"
            onClick={handleSave}
            disabled={!!checkoutLogoError || saving}
            className="gap-2"
          >
            {saving && <Spinner />}
            {saved && <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Saving..." : saved ? "Saved!" : "Save checkout appearance"}
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
  );
}
