"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Copy, Key, Plus } from "lucide-react";
import { Spinner } from "./Spinner";
import { CopyButton } from "@/components/CopyButton";
import toast from "react-hot-toast";
import { parseCidrAllowlist } from "@/utils/ipCidr";
import {
  API_KEY_PERMISSION_OPTIONS,
  FULL_ACCESS_API_KEY_PERMISSIONS,
  READ_ONLY_API_KEY_PERMISSIONS,
  type ApiKeyPermission,
} from "@/utils/apiKeyPermissions";

interface ManagedApiKey {
  id: string;
  name: string;
  last_four: string;
  environment: "live" | "test";
  status: "active" | "revoked";
  created_at: string;
  permissions: ApiKeyPermission[];
  ip_allowlist: string[];
}

interface Props {
  initialApiKey: string;
}

export function ApiKeysTab({ initialApiKey }: Props) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [keyRegenerated, setKeyRegenerated] = useState(false);
  const [gracePeriodHours, setGracePeriodHours] = useState(24);
  const [managedKeys, setManagedKeys] = useState<ManagedApiKey[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("test");
  const [accessPreset, setAccessPreset] = useState<"read-only" | "full-access" | "custom">("read-only");
  const [permissions, setPermissions] = useState<ApiKeyPermission[]>(READ_ONLY_API_KEY_PERMISSIONS);
  const [ipAllowlistText, setIpAllowlistText] = useState("");
  const [generatedKey, setGeneratedKey] = useState<Record<string, unknown> | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);

  const ipAllowlist = useMemo(() => {
    try {
      return parseCidrAllowlist(ipAllowlistText);
    } catch {
      return null;
    }
  }, [ipAllowlistText]);
  const cidrError = ipAllowlist === null && ipAllowlistText.trim()
    ? "Enter valid IPv4 or IPv6 CIDR blocks, separated by commas or new lines."
    : null;

  const loadManagedKeys = async () => {
    try {
      const result = await api.keys.listApiKeys();
      if ("error" in result) throw new Error(result.error.message);
      const payload = result.data as { data?: ManagedApiKey[] };
      setManagedKeys(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      console.error("Failed to load managed API keys:", error);
      toast.error("Unable to load managed API keys.");
    }
  };

  useEffect(() => {
    void loadManagedKeys();
  }, []);

  const applyAccessPreset = (preset: "read-only" | "full-access") => {
    setAccessPreset(preset);
    setPermissions(preset === "read-only" ? READ_ONLY_API_KEY_PERMISSIONS : FULL_ACCESS_API_KEY_PERMISSIONS);
  };

  const handleCreateApiKey = async () => {
    if (!keyName.trim() || permissions.length === 0 || cidrError) return;
    setIsCreating(true);
    try {
      const result = await api.keys.createKey({
        name: keyName.trim(),
        environment,
        permissions,
        ip_allowlist: ipAllowlist ?? [],
      });
      if ("error" in result) throw new Error(result.error.message);
      setGeneratedKey(result.data as Record<string, unknown>);
      setSecretCopied(false);
      setShowCreateModal(false);
      setShowSecretModal(true);
      void loadManagedKeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create API key.");
    } finally {
      setIsCreating(false);
    }
  };

  const copyGeneratedKey = async () => {
    const secret = generatedKey?.key;
    if (typeof secret !== "string") return;
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      toast.success("Secret copied. Store it securely now.");
    } catch {
      toast.error("Copy failed. Select and copy the key manually.");
    }
  };

  const confirmSecretSaved = useCallback(() => {
    setShowSecretModal(false);
    setGeneratedKey(null);
    setKeyName("");
    setIpAllowlistText("");
    applyAccessPreset("read-only");
  }, []);

  const closeCreateModal = useCallback(() => {
    if (!isCreating) setShowCreateModal(false);
  }, [isCreating]);

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
        <section className="space-y-3 rounded-lg border bg-background p-4" aria-labelledby="managed-api-keys-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 id="managed-api-keys-title" className="font-semibold">Scoped API keys</h4>
              <p className="text-sm text-muted-foreground">Create keys with only the access your integration needs.</p>
            </div>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create API Key
            </Button>
          </div>
          {managedKeys.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No scoped API keys created.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Name</th>
                    <th scope="col" className="py-2 pr-4">Key</th>
                    <th scope="col" className="py-2 pr-4">Permissions</th>
                    <th scope="col" className="py-2 pr-4">IP allowlist</th>
                    <th scope="col" className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {managedKeys.map((key) => (
                    <tr key={key.id}>
                      <th scope="row" className="py-3 pr-4 font-medium">
                        <span>{key.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{key.environment}</span>
                      </th>
                      <td className="py-3 pr-4 font-mono text-xs">•••• {key.last_four}</td>
                      <td className="py-3 pr-4">
                        <div className="flex max-w-sm flex-wrap gap-1">
                          {key.permissions.map((permission) => (
                            <span key={permission} className="rounded border px-1.5 py-0.5 text-xs">
                              {permission}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {key.ip_allowlist.length ? key.ip_allowlist.join(", ") : "Any IP"}
                      </td>
                      <td className="py-3 capitalize">{key.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

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

      <Modal isOpen={showCreateModal} onClose={closeCreateModal} title="Create scoped API key">
        <div className="max-h-[calc(100dvh-12rem)] space-y-5 overflow-y-auto pr-1">
          <div className="space-y-2">
            <label htmlFor="new-api-key-name" className="text-sm font-medium">Key name</label>
            <Input id="new-api-key-name" value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="e.g. Production backend" />
          </div>
          <div className="space-y-2">
            <label htmlFor="new-api-key-environment" className="text-sm font-medium">Environment</label>
            <select id="new-api-key-environment" value={environment} onChange={(event) => setEnvironment(event.target.value as "live" | "test")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Access level</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Access level">
              {(["read-only", "full-access", "custom"] as const).map((preset) => (
                <label key={preset} className={`flex min-h-16 cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${accessPreset === preset ? "border-primary bg-accent" : "border-border"}`}>
                  <input
                    type="radio"
                    name="api-key-access-level"
                    checked={accessPreset === preset}
                    onChange={() => {
                      if (preset !== "custom") applyAccessPreset(preset);
                      else setAccessPreset("custom");
                    }}
                  />
                  {preset === "read-only" ? "Read-only" : preset === "full-access" ? "Full access" : "Custom"}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Permissions</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {API_KEY_PERMISSION_OPTIONS.map((option) => (
                <label key={option.value} className="flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={permissions.includes(option.value)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setAccessPreset("custom");
                      setPermissions((current) => checked
                        ? [...current, option.value]
                        : current.filter((permission) => permission !== option.value));
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  {option.label}
                  <span className="sr-only">({option.value})</span>
                </label>
              ))}
            </div>
            {permissions.length === 0 && <p role="alert" className="text-sm text-destructive">Select at least one permission.</p>}
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="api-key-ip-allowlist" className="text-sm font-medium">IP allowlist (optional)</label>
            <textarea
              id="api-key-ip-allowlist"
              value={ipAllowlistText}
              onChange={(event) => setIpAllowlistText(event.target.value)}
              placeholder={"192.0.2.0/24\n2001:db8::/32"}
              aria-invalid={Boolean(cidrError)}
              aria-describedby="api-key-ip-help api-key-ip-error"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
            <p id="api-key-ip-help" className="text-xs text-muted-foreground">Separate IPv4 or IPv6 CIDR blocks with commas or new lines. Blank allows any IP.</p>
            {cidrError && <p id="api-key-ip-error" role="alert" className="text-sm text-destructive">{cidrError}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)} disabled={isCreating}>Cancel</Button>
            <Button onClick={handleCreateApiKey} disabled={isCreating || !keyName.trim() || permissions.length === 0 || Boolean(cidrError)} className="gap-2">
              {isCreating && <Spinner />}{isCreating ? "Creating..." : "Create API Key"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showSecretModal} onClose={confirmSecretSaved} title="Your new API key">
        <div className="space-y-4">
          <div role="alert" className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">This secret is shown only once. Copy and store it securely; it cannot be retrieved later.</p>
          </div>
          <div className="flex gap-2">
            <Input aria-label="New API key secret" readOnly value={typeof generatedKey?.key === "string" ? generatedKey.key : ""} className="font-mono text-xs" />
            <Button aria-label="Copy new API key" onClick={() => void copyGeneratedKey()} className="shrink-0 gap-2"><Copy className="h-4 w-4" />Copy</Button>
          </div>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {secretCopied
              ? "Copied. Confirm after saving this key in your secret manager."
              : "Confirm after saving this key in your secret manager. Closing this dialog permanently hides the secret."}
          </p>
          <Button className="w-full" onClick={confirmSecretSaved}>I have saved this key</Button>
        </div>
      </Modal>

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
