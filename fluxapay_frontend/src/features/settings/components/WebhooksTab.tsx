"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { api, ApiError } from "@/lib/api";
import { DOCS_URLS } from "@/lib/docs";
import { isValidHttpsWebhookUrl } from "@/lib/webhookUrl";
import { CheckCircle2, Webhook } from "lucide-react";
import { Spinner } from "./Spinner";
import type { OnDirtyChange, SaveState } from "./types";

interface Props {
  initialWebhookUrl: string;
  onDirtyChange: OnDirtyChange;
}

export function WebhooksTab({ initialWebhookUrl, onDirtyChange }: Props) {
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl);
  const [webhookError, setWebhookError] = useState("");
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  const dirty = webhookUrl !== initialWebhookUrl;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWebhookUrl(value);
    if (!value.trim()) {
      setWebhookError("");
      return;
    }
    const v = isValidHttpsWebhookUrl(value);
    setWebhookError(v.ok ? "" : v.message);
  };

  const handleSave = async () => {
    if (webhookError) return;
    setSave({ status: "saving" });
    try {
      await api.merchant.updateWebhook(webhookUrl);
      setSave({ status: "saved" });
      onDirtyChange(false);
      setTimeout(() => setSave({ status: "idle" }), 3000);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to save webhook URL";
      setWebhookError(message);
      setSave({ status: "idle" });
    }
  };

  const saving = save.status === "saving";
  const saved = save.status === "saved";

  return (
    <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
        <Webhook className="h-5 w-5" />
        <h3 className="text-lg">Webhook Configuration</h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Webhook URL</label>
          <Input
            type="url"
            value={webhookUrl}
            onChange={handleChange}
            placeholder="https://your-domain.com/webhooks"
            error={webhookError}
          />
          <p className="text-xs text-muted-foreground mt-2">
            We&apos;ll send payment notifications to this public HTTPS endpoint.
            Learn how to{" "}
            <Link
              href={DOCS_URLS.WEBHOOK_VERIFICATION}
              className="text-primary font-medium underline"
              target="_blank"
              rel="noreferrer"
            >
              verify webhook signatures
            </Link>
            . Use the Webhooks page to send a test delivery.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="dark"
            onClick={handleSave}
            disabled={!!webhookError || saving}
            className="gap-2"
          >
            {saving && <Spinner />}
            {saved && <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Webhook URL"}
          </Button>
        </div>
        {webhookError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
            <p className="text-sm">{webhookError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
