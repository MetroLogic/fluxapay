"use client";

import React, { useState } from "react";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { Copy, Key, Webhook, Shield, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
    // Account Details State
    const [businessName, setBusinessName] = useState("Acme Corporation");
    const [contactEmail, setContactEmail] = useState("contact@acme.com");
    const [accountSaved, setAccountSaved] = useState(false);
    const [isSavingAccount, setIsSavingAccount] = useState(false);

    // API Key State
    const [apiKey, setApiKey] = useState("fluxapay_live_xxxxxxxxxxxxxxxxxxxxxxxx");
    const [showRegenerateModal, setShowRegenerateModal] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [keyRegenerated, setKeyRegenerated] = useState(false);
    const [copied, setCopied] = useState(false);

    // Webhook State
    const [webhookUrl, setWebhookUrl] = useState("https://api.acme.com/webhooks");
    const [webhookError, setWebhookError] = useState("");
    const [webhookSaved, setWebhookSaved] = useState(false);
    const [isSavingWebhook, setIsSavingWebhook] = useState(false);

    // Security State
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

    // Generate random API key
    const generateApiKey = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = 'fluxapay_live_';
        for (let i = 0; i < 24; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    };

    // Handle Account Details Save
    const handleAccountSave = async () => {
        setIsSavingAccount(true);
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 800));
        console.log("Saving account details:", { businessName, contactEmail });
        setIsSavingAccount(false);
        setAccountSaved(true);
        setTimeout(() => setAccountSaved(false), 3000);
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
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Generate new API key
        const newKey = generateApiKey();
        setApiKey(newKey);
        console.log("API Key regenerated:", newKey);

        setIsRegenerating(false);
        setShowRegenerateModal(false);

        // Show success message
        setKeyRegenerated(true);
        setTimeout(() => setKeyRegenerated(false), 5000);
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
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 800));
        console.log("Saving webhook URL:", webhookUrl);
        setIsSavingWebhook(false);
        setWebhookSaved(true);
        setTimeout(() => setWebhookSaved(false), 3000);
    };

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
                            {isSavingAccount ? "Saving..." : accountSaved ? "Saved!" : "Save Changes"}
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
                                API key regenerated successfully! Make sure to update your integrations.
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
                            We'll send payment notifications to this endpoint.
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
                            {isSavingWebhook ? "Saving..." : webhookSaved ? "Saved!" : "Save Webhook URL"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Security Settings Section */}
            <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
                <div className="flex items-center gap-2 text-primary font-semibold mb-4">
                    <Shield className="h-5 w-5" />
                    <h3 className="text-lg">Security Settings</h3>
                </div>

                <div className="space-y-4">
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
