"use client";

import React, { useState } from "react";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import { CheckCircle2, Key } from "lucide-react";
import { Spinner } from "./Spinner";
import { CopyButton } from "@/components/CopyButton";
import toast from "react-hot-toast";

interface Props {
  initialApiKey: string;
}

export function ApiKeysTab({ initialApiKey }: Props) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [keyRegenerated, setKeyRegenerated] = useState(false);
  const [gracePeriodHours, setGracePeriodHours] = useState(24);

  const handleRegenerateApiKey = async () => {
    setIsRegenerating(true);
    try {
      const result = await api.keys.regenerate();
      if ("error" in result) throw new Error(result.error.message);
      const response = result.data as Record<string, unknown>;
      setApiKey(response.apiKey as string);
      setGracePeriodHours(Number(response.gracePeriodHours) || 24);
      setShowRegenerateModal(false);
      setKeyRegenerated(true);
      setTimeout(() => setKeyRegenerated(false), 5000);
    } catch (error) {
      console.error("Failed to regenerate API key:", error);
      toast.error("Failed to regenerate API key. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
        <Key className="h-5 w-5" />
        <h3 className="text-lg">API Keys</h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Live API Key</label>
          <div className="flex gap-2">
            <Input
              type="password"
              value={apiKey}
              readOnly
              aria-label="Live API key"
              className="font-mono text-sm bg-muted/50"
            />
            <CopyButton
              value={apiKey}
              label="API key"
              text="Copy"
              className="inline-flex items-center gap-2 shrink-0 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Keep your API key secure. Do not share it publicly.
          </p>
        </div>
        <div className="pt-2">
          <Button variant="destructive" onClick={() => setShowRegenerateModal(true)}>
            Rotate API Key
          </Button>
        </div>
        {keyRegenerated && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-sm font-medium">
              API key rotated. Your previous key remains active for {gracePeriodHours} {gracePeriodHours === 1 ? "hour" : "hours"}.
            </p>
          </div>
        )}
      </div>

      <Modal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        title="Rotate API Key"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your new key will work immediately. Your current key will remain
            active for 24 hours so you can update integrations without downtime.
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
              {isRegenerating && <Spinner />}
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
