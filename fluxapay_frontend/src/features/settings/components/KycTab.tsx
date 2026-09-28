"use client";

export function KycTab() {
  return (
    <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
        <h3 className="text-lg">KYC Documents</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload and manage your Know Your Customer documents for account
        verification.
      </p>
      <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
        KYC document management coming soon. Contact support to submit
        verification documents.
      </div>
    </div>
  );
}
