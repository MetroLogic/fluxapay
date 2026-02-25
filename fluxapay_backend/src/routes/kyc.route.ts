import { Router } from "express";
import multer from "multer";
import {
  submitKyc,
  uploadKycDocument,
  getKycStatus,
  updateKycStatus,
  getAllKycSubmissions,
  getKycDetailsByMerchantId,
} from "../controllers/kyc.controller";
import { validate } from "../middleware/validation.middleware";
import * as kycSchema from "../schemas/kyc.schema";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and PDF are allowed."));
    }
  },
});

/**
 * @swagger
 * components:
 *   schemas:
 *     KYCSubmission:
 *       type: object
 *       required:
 *         - business_type
 *         - legal_business_name
 *         - country_of_registration
 *         - business_address
 *         - director_full_name
 *         - director_email
 *         - director_phone
 *         - government_id_type
 *         - government_id_number
 *       properties:
 *         business_type:
 *           type: string
 *           enum: [individual, registered_business]
 *           description: Type of business
 *         legal_business_name:
 *           type: string
 *           description: Legal name of the business
 *         business_registration_number:
 *           type: string
 *           description: Business registration number (required for registered_business)
 *         country_of_registration:
 *           type: string
 *           description: Country where business is registered
 *         business_address:
 *           type: string
 *           description: Physical business address
 *         director_full_name:
 *           type: string
 *           description: Full name of the director/owner
 *         director_email:
 *           type: string
 *           format: email
 *           description: Email of the director/owner
 *         director_phone:
 *           type: string
 *           description: Phone number of the director/owner
 *         government_id_type:
 *           type: string
 *           enum: [passport, national_id, driver_license]
 *           description: Type of government ID
 *         government_id_number:
 *           type: string
 *           description: Government ID number
 *     KYCStatus:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         kyc_status:
 *           type: string
 *           enum: [not_submitted, pending_review, approved, rejected]
 *         rejection_reason:
 *           type: string
 *           nullable: true
 *         kyc:
 *           type: object
 *           nullable: true
 *         documents:
 *           type: array
 *           items:
 *             type: object
 *         required_documents:
 *           type: array
 *           items:
 *             type: string
 *         missing_documents:
 *           type: array
 *           items:
 *             type: string
 *     KYCDocument:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         document_type:
 *           type: string
 *           enum: [government_id, proof_of_business_registration, proof_of_address]
 *         file_name:
 *           type: string
 *         file_size:
 *           type: integer
 *         mime_type:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *     KYCStatusUpdate:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: [approved, rejected]
 *         rejection_reason:
 *           type: string
 *           description: Required when status is rejected
 */

/**
 * @swagger
 * /api/merchants/kyc:
 *   post:
 *     summary: Submit KYC information
 *     description: Submit merchant KYC details for verification. This is the first step in the KYC process.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KYCSubmission'
 *     responses:
 *       200:
 *         description: KYC information submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 kyc:
 *                   type: object
 *       400:
 *         description: Validation error or KYC already approved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Merchant not found
 */
router.post(
  "/",
  authenticateToken,
  validate(kycSchema.submitKycSchema),
  submitKyc
);

/**
 * @swagger
 * /api/merchants/kyc/documents:
 *   post:
 *     summary: Upload KYC document
 *     description: Upload a document for KYC verification. Supported types are government_id, proof_of_business_registration, and proof_of_address.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - document_type
 *               - file
 *             properties:
 *               document_type:
 *                 type: string
 *                 enum: [government_id, proof_of_business_registration, proof_of_address]
 *                 description: Type of document being uploaded
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Document file (JPEG, PNG, GIF, or PDF, max 10MB)
 *     responses:
 *       200:
 *         description: Document uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 document:
 *                   $ref: '#/components/schemas/KYCDocument'
 *       400:
 *         description: Validation error, invalid file type, or KYC not submitted
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/documents",
  authenticateToken,
  upload.single("file"),
  uploadKycDocument
);

/**
 * @swagger
 * /api/merchants/kyc/status:
 *   get:
 *     summary: Get KYC status
 *     description: Get the current KYC status and submitted information for the logged-in merchant
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KYCStatus'
 *       401:
 *         description: Unauthorized
 */
router.get("/status", authenticateToken, getKycStatus);

/**
 * @swagger
 * /api/merchants/kyc/admin/submissions:
 *   get:
 *     summary: Get all KYC submissions (Admin)
 *     description: Retrieve all KYC submissions with optional filtering by status. Admin only endpoint.
 *     tags: [KYC Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [not_submitted, pending_review, approved, rejected]
 *         description: Filter by KYC status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: KYC submissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 submissions:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get("/admin/submissions", authenticateToken, getAllKycSubmissions);

/**
 * @swagger
 * /api/merchants/kyc/admin/{merchantId}:
 *   get:
 *     summary: Get KYC details by merchant ID (Admin)
 *     description: Retrieve detailed KYC information for a specific merchant. Admin only endpoint.
 *     tags: [KYC Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Merchant ID
 *     responses:
 *       200:
 *         description: KYC details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: KYC not found for this merchant
 */
router.get("/admin/:merchantId", authenticateToken, getKycDetailsByMerchantId);

/**
 * @swagger
 * /api/merchants/kyc/admin/{merchantId}/status:
 *   patch:
 *     summary: Update KYC status (Admin)
 *     description: Approve or reject a merchant's KYC submission. Admin only endpoint.
 *     tags: [KYC Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Merchant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KYCStatusUpdate'
 *     responses:
 *       200:
 *         description: KYC status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 kyc:
 *                   type: object
 *       400:
 *         description: KYC not in pending review status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: KYC not found for this merchant
 */
router.patch(
  "/admin/:merchantId/status",
  authenticateToken,
  validate(kycSchema.updateKycStatusSchema),
  updateKycStatus
);

export default router;
