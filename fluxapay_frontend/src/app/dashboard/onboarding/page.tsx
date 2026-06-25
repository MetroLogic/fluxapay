"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/Button";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toastApiError";
import { COUNTRIES, validateKycFile } from "@/services/kyc";

type Step = 1 | 2 | 3 | 4 | 5;

interface KycDraft {
  business: Record<string, unknown>;
  owner: Record<string, unknown>;
  documents: Record<string, unknown>;
  bank: Record<string, unknown>;
  step: number;
}

const DRAFT_KEY = "fluxapay_kyc_draft";

function loadDraft(): KycDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as KycDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: KycDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export default function MerchantOnboardingPage() {
  const router = useRouter();
  const draft = useMemo(() => loadDraft(), []);

  const [step, setStep] = useState<Step>((draft?.step as Step) ?? 1);
  const [business, setBusiness] = useState<Record<string, unknown>>(draft?.business ?? {
    legalName: "",
    registrationNumber: "",
    country: "",
    address: "",
    website: "",
  });
  const [owner, setOwner] = useState<Record<string, unknown>>(draft?.owner ?? {
    fullName: "",
    dateOfBirth: "",
    nationality: "",
    address: "",
  });
  const [documents, setDocuments] = useState<Record<string, unknown>>(draft?.documents ?? {
    businessCertificate: null as File | null,
    governmentIdFront: null as File | null,
    governmentIdBack: null as File | null,
    proofOfAddress: null as File | null,
  });
  const [bank, setBank] = useState<Record<string, unknown>>(draft?.bank ?? {
    bankName: "",
    accountNumber: "",
    iban: "",
    swift: "",
    currency: "USD",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const draftRef = useRef({ business, owner, documents, bank, step });
  draftRef.current = { business, owner, documents, bank, step };
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftRef.current);
    }, 300);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [business, owner, documents, bank, step]);

  const handleSubmit = async () => {
    if (!business.legalName || !business.country || !business.address) {
      toast.error("Please complete all required business fields.");
      return;
    }
    if (!owner.fullName || !owner.dateOfBirth || !owner.nationality || !owner.address) {
      toast.error("Please complete all required owner fields.");
      return;
    }
    if (!bank.bankName || !bank.accountNumber || !bank.iban || !bank.swift || !bank.currency) {
      toast.error("Please complete all required bank details.");
      return;
    }

    setSubmitting(true);
    try {
      await api.kyc.admin.updateStatus("me", { status: "pending_review" });
      setSubmitted(true);
      clearDraft();
      toast.success("KYC submission received. We will review it within 1-2 business days.");
    } catch (err) {
      toastApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const nextStep = () => {
    if (step === 1 && (!business.legalName || !business.country || !business.address)) {
      toast.error("Please fill in all required fields before continuing.");
      return;
    }
    if (step === 2 && (!owner.fullName || !owner.dateOfBirth || !owner.nationality || !owner.address)) {
      toast.error("Please fill in all required fields before continuing.");
      return;
    }
    if (step === 4 && (!bank.bankName || !bank.accountNumber || !bank.iban || !bank.swift || !bank.currency)) {
      toast.error("Please fill in all required fields before continuing.");
      return;
    }
    setStep((s) => Math.min(s + 1, 5) as Step);
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1) as Step);

  if (submitted) {
    return (
      <div
        className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center shadow-sm"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" aria-hidden="true" />
        <h1 className="mb-2 text-2xl font-bold">Submission Received</h1>
        <p className="mb-6 text-muted-foreground">
          Your KYC application has been submitted for review. We will notify you by email once the review is complete.
        </p>
        <Button onClick={() => router.replace("/dashboard")} className="mx-auto">Return to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Merchant Verification</h1>
        <p className="text-muted-foreground">Complete the steps below to verify your account and start processing live payments.</p>
      </div>

      <ol className="mb-8 flex items-center gap-2" aria-label="Onboarding progress">
        {([1, 2, 3, 4, 5] as Step[]).map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold border ${
                s < step
                  ? "border-green-500 bg-green-500 text-white"
                  : s === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground"
              }`}
              aria-current={s === step ? "step" : undefined}
            >
              {s < step ? "✓" : s}
            </span>
            {s !== 5 && (
              <span
                className={`h-0.5 w-10 rounded ${s < step ? "bg-green-500" : "bg-border"}`}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        {step === 1 && (
          <StepSection title="Business Details" description="Tell us about your business.">
            <BusinessForm business={business} onChange={setBusiness} />
          </StepSection>
        )}
        {step === 2 && (
          <StepSection title="Owner Details" description="Information about the primary owner or director.">
            <OwnerForm owner={owner} onChange={setOwner} />
          </StepSection>
        )}
        {step === 3 && (
          <StepSection title="Documents" description={`Accepted: PDF, JPG, PNG (max 10 MB).`}>
            <DocumentForm documents={documents} onChange={setDocuments} />
          </StepSection>
        )}
        {step === 4 && (
          <StepSection title="Bank / Payout Details" description="Where should we send your settlements?">
            <BankForm bank={bank} onChange={setBank} />
          </StepSection>
        )}
        {step === 5 && (
          <StepSection title="Review" description="Verify your information before submitting.">
            <ReviewForm business={business} owner={owner} documents={documents} bank={bank} />
          </StepSection>
        )}

        <div className="mt-8 flex items-center justify-between">
          {step > 1 ? (
            <Button type="button" variant="secondary" onClick={prevStep} className="gap-2">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Button>
          ) : (
            <div />
          )}
          {step < 5 ? (
            <Button type="button" onClick={nextStep} className="gap-2">
              Continue <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting ? "Submitting..." : "Submit for Review"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function BusinessForm({
  business,
  onChange,
}: {
  business: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...business, [key]: value });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Legal Business Name" required id="legalName" value={(business.legalName as string) ?? ""} onChange={(v) => set("legalName", v)} />
      </div>
      <Field label="Registration Number" id="registrationNumber" value={(business.registrationNumber as string) ?? ""} onChange={(v) => set("registrationNumber", v)} />
      <SelectField label="Country of Registration" required id="businessCountry" value={(business.country as string) ?? ""} onChange={(v) => set("country", v)} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
      <div className="md:col-span-2">
        <Field label="Business Address" required id="businessAddress" value={(business.address as string) ?? ""} onChange={(v) => set("address", v)} />
      </div>
      <div className="md:col-span-2">
        <Field label="Website" id="website" value={(business.website as string) ?? ""} onChange={(v) => set("website", v)} placeholder="https://" type="url" />
      </div>
    </div>
  );
}

function OwnerForm({
  owner,
  onChange,
}: {
  owner: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...owner, [key]: value });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Full Legal Name" required id="ownerFullName" value={(owner.fullName as string) ?? ""} onChange={(v) => set("fullName", v)} />
      </div>
      <Field label="Date of Birth" required id="ownerDob" value={(owner.dateOfBirth as string) ?? ""} onChange={(v) => set("dateOfBirth", v)} type="date" />
      <SelectField label="Nationality" required id="ownerNationality" value={(owner.nationality as string) ?? ""} onChange={(v) => set("nationality", v)} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
      <div className="md:col-span-2">
        <Field label="Residential Address" required id="ownerAddress" value={(owner.address as string) ?? ""} onChange={(v) => set("address", v)} />
      </div>
    </div>
  );
}

function DocumentForm({
  documents,
  onChange,
}: {
  documents: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...documents, [key]: value });

  return (
    <div className="grid gap-5">
      <FileRow label="Business Registration Certificate" required id="businessCertificate" file={documents.businessCertificate as File | null} onChange={(f) => set("businessCertificate", f)} />
      <div className="grid gap-4 md:grid-cols-2">
        <FileRow label="Government-Issued ID (front)" required id="governmentIdFront" file={documents.governmentIdFront as File | null} onChange={(f) => set("governmentIdFront", f)} />
        <FileRow label="Government-Issued ID (back)" required id="governmentIdBack" file={documents.governmentIdBack as File | null} onChange={(f) => set("governmentIdBack", f)} />
      </div>
      <FileRow label="Proof of Address" required id="proofOfAddress" file={documents.proofOfAddress as File | null} onChange={(f) => set("proofOfAddress", f)} />
    </div>
  );
}

function FileRow({
  label,
  required,
  id,
  file,
  onChange,
}: {
  label: string;
  required?: boolean;
  id: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <div
        className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-input bg-muted/20 px-4 py-3"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
      >
        <div className="flex items-center gap-3">
          <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm">{file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">Click to upload or drag and drop</span>}</span>
        </div>
        {file && (
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            aria-label={`Remove ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <input
        id={id}
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f) {
            const error = validateKycFile(f);
            if (error) {
              toast.error(error);
              e.currentTarget.value = "";
              return;
            }
          }
          onChange(f);
        }}
      />
    </div>
  );
}

function BankForm({
  bank,
  onChange,
}: {
  bank: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...bank, [key]: value });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Bank Name" required id="bankName" value={(bank.bankName as string) ?? ""} onChange={(v) => set("bankName", v)} />
      </div>
      <Field label="Account Number" required id="accountNumber" value={(bank.accountNumber as string) ?? ""} onChange={(v) => set("accountNumber", v)} />
      <SelectField label="Currency" required id="currency" value={(bank.currency as string) ?? "USD"} onChange={(v) => set("currency", v)} options={[
        { value: "USD", label: "USD" },
        { value: "EUR", label: "EUR" },
        { value: "GBP", label: "GBP" },
        { value: "NGN", label: "NGN" },
        { value: "KES", label: "KES" },
      ]} />
      <Field label="IBAN" required id="iban" value={(bank.iban as string) ?? ""} onChange={(v) => set("iban", v.toUpperCase())} />
      <Field label="SWIFT / BIC" required id="swift" value={(bank.swift as string) ?? ""} onChange={(v) => set("swift", v.toUpperCase())} />
    </div>
  );
}

function ReviewForm({
  business,
  owner,
  documents,
  bank,
}: {
  business: Record<string, unknown>;
  owner: Record<string, unknown>;
  documents: Record<string, unknown>;
  bank: Record<string, unknown>;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Legal Name", value: (business.legalName as string) ?? "" },
    { label: "Registration Number", value: (business.registrationNumber as string) ?? "" },
    { label: "Country", value: (business.country as string) ?? "" },
    { label: "Address", value: (business.address as string) ?? "" },
    { label: "Owner", value: (owner.fullName as string) ?? "" },
    { label: "Date of Birth", value: (owner.dateOfBirth as string) ?? "" },
    { label: "Bank", value: (bank.bankName as string) ?? "" },
    { label: "Account", value: (bank.accountNumber as string) ?? "" },
    { label: "IBAN", value: (bank.iban as string) ?? "" },
    { label: "SWIFT", value: (bank.swift as string) ?? "" },
    { label: "Payout Currency", value: (bank.currency as string) ?? "" },
  ];

  const uploadedFiles = ["businessCertificate", "governmentIdFront", "governmentIdBack", "proofOfAddress"].filter(
    (key) => documents[key] instanceof File
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between rounded-md border px-4 py-2 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium">{r.value || "—"}</span>
          </div>
        ))}
      </div>
      <div className="rounded-md border px-4 py-3 text-sm">
        <span className="text-muted-foreground">Uploaded Documents: </span>
        <span className="font-medium">{uploadedFiles.length} / 4 files</span>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  required?: boolean;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input
        id={id}
        type={type}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({
  label,
  required,
  id,
  value,
  onChange,
  options,
}: {
  label: string;
  required?: boolean;
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <select
        id={id}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
