import { PrismaClient, KYCStatus, DocumentType, BusinessType, GovernmentIdType, Prisma } from "../generated/client/client";
import { uploadToCloudinary, deleteFromCloudinary } from "./cloudinary.service";
import { SubmitKycInput, UpdateKycStatusInput } from "../schemas/kyc.schema";
import { logKycDecision } from "./audit.service";

const prisma = new PrismaClient();

/**
 * Submit KYC information for a merchant
 */
export async function submitKycService(
  merchantId: string,
  data: SubmitKycInput
) {
  // Check if merchant exists
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { kyc: true },
  });

  if (!merchant) {
    throw { status: 404, message: "Merchant not found" };
  }

  // Check if KYC already exists
  if (merchant.kyc) {
    // If KYC is approved, don't allow resubmission
    if (merchant.kyc.kyc_status === "approved") {
      throw { status: 400, message: "KYC already approved. Cannot resubmit." };
    }

    // Update existing KYC
    const updatedKyc = await prisma.merchantKYC.update({
      where: { merchantId },
      data: {
        business_type: data.business_type as BusinessType,
        legal_business_name: data.legal_business_name,
        business_registration_number: data.business_registration_number,
        country_of_registration: data.country_of_registration,
        business_address: data.business_address,
        director_full_name: data.director_full_name,
        director_email: data.director_email,
        director_phone: data.director_phone,
        government_id_type: data.government_id_type as GovernmentIdType,
        government_id_number: data.government_id_number,
        kyc_status: "pending_review",
        rejection_reason: null,
      },
    });

    return {
      message: "KYC information updated and submitted for review",
      kyc: updatedKyc,
    };
  }

  // Create new KYC record
  const kyc = await prisma.merchantKYC.create({
    data: {
      merchantId,
      business_type: data.business_type as BusinessType,
      legal_business_name: data.legal_business_name,
      business_registration_number: data.business_registration_number,
      country_of_registration: data.country_of_registration,
      business_address: data.business_address,
      director_full_name: data.director_full_name,
      director_email: data.director_email,
      director_phone: data.director_phone,
      government_id_type: data.government_id_type as GovernmentIdType,
      government_id_number: data.government_id_number,
      kyc_status: "pending_review",
    },
  });

  return {
    message: "KYC information submitted for review",
    kyc,
  };
}

/**
 * Upload a KYC document
 */
export async function uploadKycDocumentService(
  merchantId: string,
  documentType: DocumentType,
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }
) {
  // Validate file type
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/pdf",
  ];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw {
      status: 400,
      message: "Invalid file type. Only JPEG, PNG, GIF, and PDF are allowed.",
    };
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw { status: 400, message: "File size exceeds 10MB limit" };
  }

  // Get merchant KYC
  const kyc = await prisma.merchantKYC.findUnique({
    where: { merchantId },
    include: { documents: true },
  });

  if (!kyc) {
    throw {
      status: 400,
      message: "Please submit KYC information before uploading documents",
    };
  }

  if (kyc.kyc_status === "approved") {
    throw { status: 400, message: "KYC already approved. Cannot upload documents." };
  }

  // Check if document type already exists
  const existingDocument = kyc.documents.find(
    (doc: { document_type: DocumentType; id: string; public_id: string }) => doc.document_type === documentType
  );

  // Upload to Cloudinary
  const uploadResult = await uploadToCloudinary(
    file.buffer,
    file.originalname,
    `kyc-documents/${merchantId}`
  );

  // If existing document, delete old one from Cloudinary
  if (existingDocument) {
    try {
      await deleteFromCloudinary(existingDocument.public_id);
    } catch (error) {
      console.error("Failed to delete old document from Cloudinary:", error);
    }

    // Update existing document
    const updatedDocument = await prisma.kYCDocument.update({
      where: { id: existingDocument.id },
      data: {
        file_name: file.originalname,
        file_url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        file_size: uploadResult.bytes,
        mime_type: file.mimetype,
      },
    });

    return {
      message: "Document updated successfully",
      document: updatedDocument,
    };
  }

  // Create new document
  const document = await prisma.kYCDocument.create({
    data: {
      kycId: kyc.id,
      document_type: documentType,
      file_name: file.originalname,
      file_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      file_size: uploadResult.bytes,
      mime_type: file.mimetype,
    },
  });

  return {
    message: "Document uploaded successfully",
    document,
  };
}

/**
 * Get KYC status for a merchant
 */
export async function getKycStatusService(merchantId: string) {
  const kyc = await prisma.merchantKYC.findUnique({
    where: { merchantId },
    include: {
      documents: {
        select: {
          id: true,
          document_type: true,
          file_name: true,
          file_size: true,
          mime_type: true,
          created_at: true,
        },
      },
    },
  });

  if (!kyc) {
    return {
      message: "KYC not submitted",
      kyc_status: "not_submitted" as KYCStatus,
      kyc: null,
    };
  }

  // Determine required documents based on business type
  const requiredDocs: DocumentType[] = ["government_id", "proof_of_address"];
  if (kyc.business_type === "registered_business") {
    requiredDocs.push("proof_of_business_registration");
  }

  // Check which documents are missing
  const uploadedDocTypes = kyc.documents.map((doc: { document_type: DocumentType }) => doc.document_type);
  const missingDocuments = requiredDocs.filter(
    (docType) => !uploadedDocTypes.includes(docType)
  );

  return {
    message: "KYC status retrieved",
    kyc_status: kyc.kyc_status,
    rejection_reason: kyc.rejection_reason,
    kyc: {
      id: kyc.id,
      business_type: kyc.business_type,
      legal_business_name: kyc.legal_business_name,
      business_registration_number: kyc.business_registration_number,
      country_of_registration: kyc.country_of_registration,
      business_address: kyc.business_address,
      director_full_name: kyc.director_full_name,
      director_email: kyc.director_email,
      director_phone: kyc.director_phone,
      government_id_type: kyc.government_id_type,
      created_at: kyc.created_at,
      updated_at: kyc.updated_at,
    },
    documents: kyc.documents,
    required_documents: requiredDocs,
    missing_documents: missingDocuments,
  };
}

/**
 * Update KYC status (admin only)
 */
export async function updateKycStatusService(
  merchantId: string,
  data: UpdateKycStatusInput,
  reviewerId: string
) {
  const kyc = await prisma.merchantKYC.findUnique({
    where: { merchantId },
  });

  if (!kyc) {
    throw { status: 404, message: "KYC not found for this merchant" };
  }

  if (kyc.kyc_status !== "pending_review") {
    throw {
      status: 400,
      message: "KYC is not in pending review status",
    };
  }

  const previousStatus = kyc.kyc_status;
  const newStatus = data.status as KYCStatus;
  const action = data.status === "approved" ? "approve" : "reject";

  // Use transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Update KYC status
    const updatedKyc = await tx.merchantKYC.update({
      where: { merchantId },
      data: {
        kyc_status: newStatus,
        rejection_reason: data.status === "rejected" ? data.rejection_reason : null,
        reviewed_at: new Date(),
        reviewed_by: reviewerId,
      },
    });

    // Create audit log entry
    await logKycDecision(
      {
        adminId: reviewerId,
        merchantId,
        action,
        previousStatus,
        newStatus,
        reason: data.rejection_reason,
      },
      tx
    );

    return updatedKyc;
  });

  return {
    message: `KYC ${data.status}`,
    kyc: result,
  };
}

/**
 * Get all KYC submissions for admin review
 */
export async function getAllKycSubmissionsService(
  status?: KYCStatus,
  page: number = 1,
  limit: number = 10
) {
  const where = status ? { kyc_status: status } : {};
  const skip = (page - 1) * limit;

  const [submissions, total] = await Promise.all([
    prisma.merchantKYC.findMany({
      where,
      include: {
        merchant: {
          select: {
            id: true,
            business_name: true,
            email: true,
            country: true,
          },
        },
        documents: {
          select: {
            id: true,
            document_type: true,
            file_name: true,
            file_url: true,
            file_size: true,
            mime_type: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.merchantKYC.count({ where }),
  ]);

  return {
    message: "KYC submissions retrieved",
    submissions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get KYC details by merchant ID (admin only)
 */
export async function getKycDetailsByMerchantIdService(merchantId: string) {
  const kyc = await prisma.merchantKYC.findUnique({
    where: { merchantId },
    include: {
      merchant: {
        select: {
          id: true,
          business_name: true,
          email: true,
          phone_number: true,
          country: true,
          settlement_currency: true,
          status: true,
          created_at: true,
        },
      },
      documents: true,
    },
  });

  if (!kyc) {
    throw { status: 404, message: "KYC not found for this merchant" };
  }

  return {
    message: "KYC details retrieved",
    kyc,
  };
}
