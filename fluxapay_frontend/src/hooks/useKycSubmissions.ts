import useSWR from "swr";
import { api } from "@/lib/api";

export interface KycDocument {
  type: string;
  name: string;
  url?: string;
}

export interface BeneficialOwner {
  name: string;
  role: string;
  ownership: number;
}

export interface BusinessInfo {
  registrationNumber: string;
  type: string;
  address: string;
}

export interface AuditEntry {
  action: string;
  performedBy: string;
  timestamp: string;
  note?: string;
}

export type KycStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "additional_info_required";

export interface KycApplicationShape {
  id: string;
  merchantId: string;
  merchantName: string;
  email: string;
  country: string;
  status: KycStatus;
  submittedDate: string;
  documents: KycDocument[];
  beneficialOwners: BeneficialOwner[];
  businessInfo: BusinessInfo;
  rejectionReason?: string;
  auditTrail: AuditEntry[];
}

// ── normalise raw API response ──────────────────────────────────────────────

function normaliseSubmission(raw: Record<string, unknown>): KycApplicationShape {
  return {
    id: String(raw.id ?? raw._id ?? ""),
    merchantId: String(raw.merchant_id ?? raw.merchantId ?? raw.id ?? ""),
    merchantName: String(raw.business_name ?? raw.merchantName ?? raw.name ?? ""),
    email: String(raw.email ?? ""),
    country: String(raw.country ?? ""),
    status: (raw.kyc_status ?? raw.status ?? "pending") as KycStatus,
    submittedDate: raw.submitted_at
      ? new Date(raw.submitted_at as string).toLocaleDateString()
      : raw.created_at
        ? new Date(raw.created_at as string).toLocaleDateString()
        : "—",
    documents: Array.isArray(raw.documents)
      ? (raw.documents as Record<string, unknown>[]).map((d) => ({
          type: String(d.type ?? "Document"),
          name: String(d.name ?? d.filename ?? ""),
          url: d.url ? String(d.url) : undefined,
        }))
      : [],
    beneficialOwners: Array.isArray(raw.beneficial_owners)
      ? (raw.beneficial_owners as Record<string, unknown>[]).map((o) => ({
          name: String(o.name ?? ""),
          role: String(o.role ?? ""),
          ownership: Number(o.ownership ?? 0),
        }))
      : [],
    businessInfo: {
      registrationNumber: String(
        (raw.business_info as Record<string, unknown>)?.registration_number ??
          raw.registration_number ??
          "—",
      ),
      type: String(
        (raw.business_info as Record<string, unknown>)?.type ??
          raw.business_type ??
          "—",
      ),
      address: String(
        (raw.business_info as Record<string, unknown>)?.address ??
          raw.business_address ??
          "—",
      ),
    },
    rejectionReason: raw.rejection_reason
      ? String(raw.rejection_reason)
      : undefined,
    auditTrail: Array.isArray(raw.audit_trail)
      ? (raw.audit_trail as Record<string, unknown>[]).map((e) => ({
          action: String(e.action ?? ""),
          performedBy: String(e.performed_by ?? e.performedBy ?? "admin"),
          timestamp: e.timestamp
            ? new Date(e.timestamp as string).toLocaleString()
            : "",
          note: e.note ? String(e.note) : undefined,
        }))
      : [],
  };
}

// ── list hook ───────────────────────────────────────────────────────────────

interface UseKycSubmissionsParams {
  status?: string;
  page?: number;
  limit?: number;
}

interface UseKycSubmissionsResult {
  applications: KycApplicationShape[];
  isLoading: boolean;
  error: unknown;
  mutate: () => void;
}

export function useKycSubmissions(
  params: UseKycSubmissionsParams = {},
): UseKycSubmissionsResult {
  const key = ["kyc-submissions", params.status, params.page, params.limit];

  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => api.kyc.admin.getSubmissions(params),
    { revalidateOnFocus: false },
  );

  const raw: Record<string, unknown>[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.submissions)
      ? data.submissions
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return {
    applications: raw.map(normaliseSubmission),
    isLoading,
    error,
    mutate,
  };
}

// ── detail hook ─────────────────────────────────────────────────────────────

interface UseKycDetailsResult {
  application: KycApplicationShape | null;
  isLoading: boolean;
  error: unknown;
}

export function useKycDetails(merchantId: string | null): UseKycDetailsResult {
  const { data, error, isLoading } = useSWR(
    merchantId ? ["kyc-detail", merchantId] : null,
    () => api.kyc.admin.getByMerchantId(merchantId!),
    { revalidateOnFocus: false },
  );

  const raw = data?.submission ?? data?.data ?? data ?? null;

  return {
    application: raw ? normaliseSubmission(raw as Record<string, unknown>) : null,
    isLoading,
    error,
  };
}
