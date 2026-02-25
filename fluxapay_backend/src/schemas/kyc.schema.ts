import { z } from 'zod';

export const businessTypeEnum = z.enum(['individual', 'registered_business']);
export const governmentIdTypeEnum = z.enum(['passport', 'national_id', 'driver_license']);
export const kycStatusEnum = z.enum(['not_submitted', 'pending_review', 'approved', 'rejected']);
export const documentTypeEnum = z.enum(['government_id', 'proof_of_business_registration', 'proof_of_address']);

export const submitKycSchema = z.object({
  business_type: businessTypeEnum,
  legal_business_name: z.string().min(2, 'Legal business name is required'),
  business_registration_number: z.string().optional(),
  country_of_registration: z.string().min(2, 'Country of registration is required'),
  business_address: z.string().min(5, 'Business address is required'),
  director_full_name: z.string().min(2, 'Director full name is required'),
  director_email: z.string().email('Invalid director email address'),
  director_phone: z.string().min(7, 'Director phone number is required'),
  government_id_type: governmentIdTypeEnum,
  government_id_number: z.string().min(3, 'Government ID number is required'),
}).refine(
  (data) => {
    // If business_type is registered_business, business_registration_number is required
    if (data.business_type === 'registered_business' && !data.business_registration_number) {
      return false;
    }
    return true;
  },
  {
    message: 'Business registration number is required for registered businesses',
    path: ['business_registration_number'],
  }
);

export const uploadDocumentSchema = z.object({
  document_type: documentTypeEnum,
});

export const updateKycStatusSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().optional(),
}).refine(
  (data) => {
    // If status is rejected, rejection_reason is required
    if (data.status === 'rejected' && !data.rejection_reason) {
      return false;
    }
    return true;
  },
  {
    message: 'Rejection reason is required when rejecting KYC',
    path: ['rejection_reason'],
  }
);

export type SubmitKycInput = z.infer<typeof submitKycSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type UpdateKycStatusInput = z.infer<typeof updateKycStatusSchema>;
