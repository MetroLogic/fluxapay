"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/Button";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Upload,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toastApiError";
import { COUNTRIES, ID_TYPES, validateKycFile } from "@/services/kyc";
import {
  validateBusinessRegistration,
  getRegistrationFormat,
  hasRegistrationValidation,
} from "@/lib/businessRegistrationValidation";

type Step = 1 | 2 | 3 | 4 | 5;

interface KycDraft {
  business: Record<string, unknown>;
  owner: Record<string, unknown>;
  documents: Record<string, unknown>;
  bank: Record<string, unknown>;
  step: number;
}

const DRAFT_KEY = "fluxapay_kyc_draft";

/**
 * Bank fields that must never reach localStorage (#777).
 *
 * localStorage is readable by any script on the origin and persists
 * indefinitely, so an account number left there outlives the session and is
 * exposed to any XSS. They are dropped on save, which means the bank step is
 * deliberately *not* restored — a merchant re-enters those four fields, and
 * that is the intended trade-off.
 */
const SENSITIVE_BANK_FIELDS = ["accountNumber", "iban", "swift"] as const;

/** Strip sensitive values from a bank slice before it is persisted. */
export function redactBankForDraft(
  bank: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = { ...bank };
  for (const field of SENSITIVE_BANK_FIELDS) {
    delete safe[field];
  }
  return safe;
}

/** Mask sensitive bank values in the review step while keeping the last four visible. */
export function maskBankDetail(value: string): string {
  if (!value) return "";
  return "*".repeat(Math.max(4, value.length - 4)) + (value.length > 4 ? value.slice(-4) : "");
}

function loadDraft(): KycDraft | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as KycDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: KycDraft) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, bank: redactBankForDraft(draft.bank) }),
    );
  } catch {
    // A full or unavailable store costs the draft, not the form.
  }
}

function clearDraft() {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clean up */
  }
}

/** Slices that carry restorable draft data, in the order the steps present them. */
const RESTORABLE_SECTIONS = ["business", "owner", "bank"] as const;

/** Query param carrying the visible step so browser back/forward can walk the wizard (#1192). */
const STEP_PARAM = "step";

const MIN_STEP = 1;
const MAX_STEP = 5;

/** Clamp an arbitrary value into the 1-5 step range. */
function clampStep(value: number): Step {
  return Math.min(MAX_STEP, Math.max(MIN_STEP, Math.round(value))) as Step;
}

/**
 * Read the step from `?step=`, ignoring absent, blank, and non-numeric values.
 * Returns null when the URL carries no usable step so the caller can fall back
 * to the draft rather than jumping the merchant to step 1.
 */
function readStepFromUrl(): Step | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = new URL(window.location.href).searchParams.get(STEP_PARAM);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return clampStep(parsed);
  } catch {
    return null;
  }
}

/**
 * Reflect the current step into the query string.
 *
 * `push` controls whether a history entry is created: advancing or going back
 * through the wizard pushes, while a plain restore of the same step replaces so
 * a reload does not stack duplicate entries (#1192).
 */
function writeStepToUrl(step: Step, push: boolean) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (step === MIN_STEP) {
      // Step 1 is the default view, so keep the URL clean.
      url.searchParams.delete(STEP_PARAM);
    } else {
      url.searchParams.set(STEP_PARAM, String(step));
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      return;
    }
    if (push) {
      window.history.pushState({ [STEP_PARAM]: step }, "", next);
    } else {
      window.history.replaceState({ [STEP_PARAM]: step }, "", next);
    }
  } catch {
    // A blocked or unavailable history must not break the form.
  }
}

/**
 * Marks a group of fields as carrying restored draft values (#777).
 *
 * A merchant needs to be able to tell at a glance which values they typed just
 * now and which came back from a previous session, so restored groups stay
 * visually distinct until the restore banner is dismissed.
 */
function RestoredFields({
  restored,
  children,
}: {
  restored: boolean;
  children: React.ReactNode;
}) {
  if (!restored) return <>{children}</>;

  return (
    <div
      data-testid="restored-fields"
      data-restored="true"
      className="rounded-xl border-l-4 border-amber-400 bg-amber-50/40 pl-4"
    >
      <p className="pt-3 text-xs font-medium text-amber-800">
        Restored from your saved draft — please review before continuing.
      </p>
      {children}
    </div>
  );
}

export default function MerchantOnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [business, setBusiness] = useState<Record<string, unknown>>({
    businessType: "registered_business",
    legalName: "",
    registrationNumber: "",
    country: "",
    address: "",
    email: "",
    phone: "",
    governmentIdType: "passport",
    governmentIdNumber: "",
    website: "",
  });
  const [owner, setOwner] = useState<Record<string, unknown>>({
    fullName: "",
    dateOfBirth: "",
    nationality: "",
    address: "",
  });
  const [documents, setDocuments] = useState<Record<string, unknown>>({
    businessCertificate: null as File | null,
    governmentIdFront: null as File | null,
    governmentIdBack: null as File | null,
    proofOfAddress: null as File | null,
  });
  const [bank, setBank] = useState<Record<string, unknown>>({
    bankName: "",
    accountNumber: "",
    iban: "",
    swift: "",
    currency: "USD",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /** Which sections came back from a draft and have not yet been confirmed. */
  const [restoredSections, setRestoredSections] = useState<string[]>([]);

  /**
   * Restore the saved draft on mount (#777).
   *
   * This runs in an effect rather than during render because `localStorage` is
   * unavailable on the server: seeding state from it directly makes the first
   * client render disagree with the server HTML, and React discards the
   * mismatched tree — which is exactly how a saved draft ends up looking lost
   * after a refresh.
   *
   * Restoring is skipped once the form has been submitted, so a stale draft
   * cannot repopulate a finished application.
   */
  const hasRestored = useRef(false);
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    const draft = loadDraft();
    // A step in the URL means browser back/forward already chose a step, so it
    // wins over the one recorded in the draft (#1192).
    const urlStep = readStepFromUrl();
    if (!draft && urlStep === null) return;

    const restored: string[] = [];
    if (draft?.business && Object.keys(draft.business).length > 0) {
      setBusiness((current) => ({ ...current, ...draft.business }));
      restored.push("business");
    }
    if (draft?.owner && Object.keys(draft.owner).length > 0) {
      setOwner((current) => ({ ...current, ...draft.owner }));
      restored.push("owner");
    }
    // Sensitive bank fields were never written, so only the safe ones return.
    if (draft?.bank && Object.keys(draft.bank).length > 0) {
      setBank((current) => ({ ...current, ...draft.bank }));
      restored.push("bank");
    }
    // The URL wins over the draft so back/forward lands where the URL says (#1192).
    const initialStep = urlStep ?? (draft?.step ? clampStep(Number(draft.step)) : null);
    if (initialStep !== null) {
      setStep(initialStep);
      // Normalise the URL without adding a history entry for the restore itself.
      writeStepToUrl(initialStep, false);
    }

    // File inputs cannot be rehydrated from storage, so `documents` is skipped.
    if (restored.length > 0) {
      setRestoredSections(restored.filter((s) =>
        (RESTORABLE_SECTIONS as readonly string[]).includes(s),
      ));
    }
  }, []);

  const draftRef = useRef({ business, owner, documents, bank, step });
  draftRef.current = { business, owner, documents, bank, step };
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * True once the application has been submitted, so the flush below knows not
   * to re-persist a draft that `clearDraft()` just deleted (#1192).
   */
  const hasSubmittedRef = useRef(false);

  /** Write the draft immediately, cancelling any pending debounce (#1192). */
  const flushDraft = useRef(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    // A submitted application must not reappear as a resumable draft.
    if (hasSubmittedRef.current) return;
    saveDraft(draftRef.current);
  }).current;

  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (hasSubmittedRef.current) return;
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      saveDraft(draftRef.current);
    }, 300);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [business, owner, documents, bank, step]);

  /**
   * Flush on the way out so a back press or tab switch cannot drop the last
   * keystrokes (#1192).
   *
   * The debounced save alone loses everything typed in the 300ms before an
   * unmount, and its cleanup cancels the pending timer rather than flushing it.
   * `pagehide` and `visibilitychange` cover the cases where React never unmounts
   * the component at all — a bfcache navigation, a tab switch, or mobile Safari
   * discarding the page.
   */
  useEffect(() => {
    const flush = () => flushDraft();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Unmount last: write before the effect above cancels the pending timer.
      flush();
    };
  }, [flushDraft]);

  /**
   * Let the browser back and forward buttons walk the wizard (#1192).
   *
   * Each step change pushes a history entry, so the wizard behaves like a stack
   * of pages rather than a single long form the user has to restart.
   */
  const hasSyncedUrl = useRef(false);
  useEffect(() => {
    // On mount the restore effect has already written the step with
    // replaceState, so only genuine step changes push an entry.
    if (!hasSyncedUrl.current) {
      hasSyncedUrl.current = true;
      return;
    }

    writeStepToUrl(step, true);
  }, [step]);

  useEffect(() => {
    const onPopState = () => {
      const target = readStepFromUrl();
      if (target === null) return;
      setStep((current) => (current === target ? current : target));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goToStep = (next: Step) => {
    setStep((current) => (current === next ? current : next));
    // Keep the draft in step with the visible step immediately, so a back press
    // right after navigating still restores to the right place.
    draftRef.current = { ...draftRef.current, step: next };
    saveDraft(draftRef.current);
  };

  const isRestored = (section: string) => restoredSections.includes(section);
  const confirmRestored = () => setRestoredSections([]);

  const handleSubmit = async () => {
    if (!business.legalName || !business.country || !business.address) {
      toast.error("Please complete all required business fields.");
      return;
    }
    if (!owner.fullName || !owner.dateOfBirth || !owner.nationality || !owner.address || !owner.email || !owner.phone || !owner.governmentIdNumber) {
      toast.error("Please complete all required owner fields.");
      return;
    }
    if (!documents.businessCertificate || !documents.governmentIdFront || !documents.governmentIdBack || !documents.proofOfAddress) {
      toast.error("Please upload all required verification documents.");
      return;
    }
    if (!bank.bankName || !bank.accountNumber || !bank.iban || !bank.swift || !bank.currency) {
      toast.error("Please complete all required bank details.");
      return;
    }

    setSubmitting(true);
    try {
      const submission = await api.kyc.submit({
        business_type: business.businessType as "individual" | "registered_business",
        legal_business_name: business.legalName as string,
        business_registration_number: (business.registrationNumber as string) || undefined,
        country_of_registration: business.country as string,
        business_address: business.address as string,
        director_full_name: owner.fullName as string,
        director_date_of_birth: owner.dateOfBirth as string,
        director_nationality: owner.nationality as string,
        director_address: owner.address as string,
        director_email: owner.email as string,
        director_phone: owner.phone as string,
        government_id_type: owner.governmentIdType as "passport" | "national_id" | "driver_license",
        government_id_number: owner.governmentIdNumber as string,
      });
      if ("error" in submission) throw new Error(submission.error.message);

      const documentsToUpload = [
        [documents.businessCertificate, "proof_of_business_registration"],
        [documents.governmentIdFront, "government_id"],
        [documents.governmentIdBack, "government_id"],
        [documents.proofOfAddress, "proof_of_address"],
      ] as const;
      for (const [file, documentType] of documentsToUpload) {
        const upload = await api.kyc.uploadDocument(file as File, documentType);
        if ("error" in upload) throw new Error(upload.error.message);
      }
      // Set the guard before clearing, so the unmount flush cannot resurrect
      // the draft this submission is retiring (#1192).
      hasSubmittedRef.current = true;
      setSubmitted(true);
      clearDraft();
      toast.success("KYC submission received. We will review it within 1-2 business days.");
    } catch (err) {
      toastApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const uploadedDocumentCount = [
    "businessCertificate",
    "governmentIdFront",
    "governmentIdBack",
    "proofOfAddress",
  ].filter((key) => documents[key] instanceof File).length;

  const nextStep = () => {
    if (step === 1) {
      if (!business.legalName || !business.country || !business.address) {
        toast.error("Please fill in all required fields before continuing.");
        return;
      }
      // Validate registration number if provided and country supports validation
      const regNumber = business.registrationNumber as string;
      const country = business.country as string;
      if (regNumber && regNumber.trim() && country) {
        const result = validateBusinessRegistration(regNumber, country);
        if (!result.valid) {
          toast.error(result.message || "Invalid registration number format.");
          return;
        }
      }
    }
    if (step === 2 && (!owner.fullName || !owner.dateOfBirth || !owner.nationality || !owner.address)) {
      toast.error("Please fill in all required fields before continuing.");
      return;
    }
    if (step === 3 && uploadedDocumentCount === 0) {
      toast.error("Please upload at least one document before continuing.");
      return;
    }
    if (step === 4 && (!bank.bankName || !bank.accountNumber || !bank.iban || !bank.swift || !bank.currency)) {
      toast.error("Please fill in all required fields before continuing.");
      return;
    }
    goToStep(clampStep(step + 1));
  };

  const prevStep = () => goToStep(clampStep(step - 1));

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

      {restoredSections.length > 0 && (
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
          aria-live="polite"
          data-testid="draft-restored-banner"
        >
          <p>
            We restored your progress from last time.
            {isRestored("bank") && (
              <span className="block text-xs opacity-80">
                For your security, bank account, IBAN and SWIFT details are never
                saved and need to be entered again.
              </span>
            )}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={confirmRestored}>
            Got it
          </Button>
        </div>
      )}

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
            <RestoredFields restored={isRestored("business")}>
              <BusinessForm business={business} onChange={setBusiness} />
            </RestoredFields>
          </StepSection>
        )}
        {step === 2 && (
          <StepSection title="Owner Details" description="Information about the primary owner or director.">
            <RestoredFields restored={isRestored("owner")}>
              <OwnerForm owner={owner} onChange={setOwner} />
            </RestoredFields>
          </StepSection>
        )}
        {step === 3 && (
          <StepSection title="Documents" description={`Accepted: PDF, JPG, PNG (max 10 MB).`}>
            <p
              className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
              data-testid="document-reupload-note"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Your other details are saved as you go, but uploaded documents are
                kept in memory only. If you leave this page or go back past this
                step, you will need to select your files again.
              </span>
            </p>
            <DocumentForm documents={documents} onChange={setDocuments} />
          </StepSection>
        )}
        {step === 4 && (
          <StepSection title="Bank / Payout Details" description="Where should we send your settlements?">
            <RestoredFields restored={isRestored("bank")}>
              <BankForm bank={bank} onChange={setBank} />
            </RestoredFields>
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
            <Button
              type="button"
              onClick={nextStep}
              className="gap-2"
              disabled={step === 3 && uploadedDocumentCount === 0}
            >
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
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const set = (key: string, value: unknown) => onChange({ ...business, [key]: value });

  const handleRegistrationNumberChange = (value: string) => {
    set("registrationNumber", value);
    
    // Validate if country is selected and registration number is not empty
    const country = business.country as string;
    if (country && value.trim()) {
      const result = validateBusinessRegistration(value, country);
      if (!result.valid) {
        setRegistrationError(result.message || "Invalid format");
      } else {
        setRegistrationError(null);
      }
    } else {
      setRegistrationError(null);
    }
  };

  const handleCountryChange = (value: string) => {
    set("country", value);
    
    // Re-validate registration number if it exists
    const regNumber = business.registrationNumber as string;
    if (regNumber && regNumber.trim()) {
      const result = validateBusinessRegistration(regNumber, value);
      if (!result.valid) {
        setRegistrationError(result.message || "Invalid format");
      } else {
        setRegistrationError(null);
      }
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Legal Business Name" required id="legalName" value={(business.legalName as string) ?? ""} onChange={(v) => set("legalName", v)} />
      </div>
      <SelectField label="Business Type" required id="businessType" value={(business.businessType as string) ?? "registered_business"} onChange={(v) => set("businessType", v)} options={[{ value: "registered_business", label: "Registered business" }, { value: "individual", label: "Individual" }]} />
      <div>
        <Field label="Registration Number" id="registrationNumber" value={(business.registrationNumber as string) ?? ""} onChange={handleRegistrationNumberChange} />
        {registrationError && (
          <p className="mt-1 text-xs text-red-500">{registrationError}</p>
        )}
        {!registrationError && business.country && hasRegistrationValidation(business.country as string) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {getRegistrationFormat(business.country as string)}
          </p>
        )}
      </div>
      <SelectField label="Country of Registration" required id="businessCountry" value={(business.country as string) ?? ""} onChange={handleCountryChange} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
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
      <Field label="Email" required id="ownerEmail" value={(owner.email as string) ?? ""} onChange={(v) => set("email", v)} type="email" />
      <Field label="Phone" required id="ownerPhone" value={(owner.phone as string) ?? ""} onChange={(v) => set("phone", v)} type="tel" />
      <div className="md:col-span-2">
        <Field label="Residential Address" required id="ownerAddress" value={(owner.address as string) ?? ""} onChange={(v) => set("address", v)} />
      </div>
      <SelectField label="Government ID Type" required id="governmentIdType" value={(owner.governmentIdType as string) ?? "passport"} onChange={(v) => set("governmentIdType", v)} options={ID_TYPES} />
      <Field label="Government ID Number" required id="governmentIdNumber" value={(owner.governmentIdNumber as string) ?? ""} onChange={(v) => set("governmentIdNumber", v)} />
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
    { label: "Account", value: maskBankDetail((bank.accountNumber as string) ?? "") },
    { label: "IBAN", value: maskBankDetail((bank.iban as string) ?? "") },
    { label: "SWIFT", value: maskBankDetail((bank.swift as string) ?? "") },
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
