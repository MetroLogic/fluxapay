// KYC submission request matching backend /api/v1/merchants/kyc POST
export interface KycSubmitPayload {
  business_type: "individual" | "registered_business";
  legal_business_name: string;
  business_registration_number?: string;
  country_of_registration: string;
  business_address: string;
  director_full_name: string;
  director_date_of_birth: string;
  director_nationality: string;
  director_address: string;
  director_email: string;
  director_phone: string;
  government_id_type: "passport" | "national_id" | "driver_license";
  government_id_number: string;
}

export interface KycStatusResponse {
  message: string;
  kyc_status: "not_submitted" | "pending_review" | "approved" | "rejected";
  rejection_reason?: string;
  kyc?: Record<string, unknown>;
  documents?: Array<{
    id: string;
    document_type: string;
    file_name: string;
    file_size: number;
    mime_type: string;
    created_at: string;
  }>;
  required_documents?: string[];
  missing_documents?: string[];
}

export interface KycDocumentUploadResponse {
  message: string;
  document: {
    id: string;
    document_type: string;
    file_name: string;
    file_size: number;
    mime_type: string;
    created_at: string;
  };
}

export const VALID_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function validateKycFile(file: File): string | null {
  if (!VALID_MIME_TYPES.has(file.type)) {
    return `Invalid file type: ${file.type}. Only PDF, JPG, and PNG are allowed.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large: ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum size is 10MB.`;
  }
  return null;
}

export const COUNTRIES = [
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "GH", name: "Ghana" },
  { code: "ZA", name: "South Africa" },
  { code: "EG", name: "Egypt" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
];

export const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "national_id", label: "National ID Card" },
  { value: "driver_license", label: "Driver's License" },
];
