import { Router } from "express";
import {
  signupMerchant,
  loginMerchant,
  verifyOtp,
  resendOtp,
  getLoggedInMerchant,
  updateMerchantProfile,
  updateMerchantWebhook,
  rotateApiKey,
  rotateWebhookSecret,
  adminListMerchants,
  adminGetMerchant,
  adminUpdateMerchantStatus,
  updateSettlementSchedule,
  addBankAccount,
} from "../controllers/merchant.controller";
import { validate } from "../middleware/validation.middleware";
import * as merchantSchema from "../schemas/merchant.schema";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import { updateSettlementScheduleSchema, bankAccountSchema } from "../schemas/merchant.schema";

const router = Router();


/**
 * @swagger
 * /api/v1/merchants/signup:
 *   post:
 *     summary: Register a new merchant
 *     tags: [Merchants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - business_name
 *               - email
 *               - phone_number
 *               - country
 *               - settlement_currency
 *               - password
 *             properties:
 *               business_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               country:
 *                 type: string
 *               settlement_currency:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Merchant registered, OTP sent
 *       400:
 *         description: Email or phone already exists
 */
router.post("/signup", idempotencyMiddleware, validate(merchantSchema.signupSchema), signupMerchant);

/**
 * @swagger
 * /api/v1/merchants/login:
 *   post:
 *     summary: Login a merchant
 *     tags: [Merchants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 */
router.post("/login", validate(merchantSchema.loginSchema), loginMerchant);

/**
 * @swagger
 * /api/v1/merchants/verify-otp:
 *   post:
 *     summary: Verify OTP for merchant activation
 *     tags: [Merchants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - merchantId
 *               - channel
 *               - otp
 *             properties:
 *               merchantId:
 *                 type: string
 *               channel:
 *                 type: string
 *                 enum: [email, phone]
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Merchant verified and activated
 *       400:
 *         description: Invalid or expired OTP
 */
router.post("/verify-otp", idempotencyMiddleware, validate(merchantSchema.verifyOtpSchema), verifyOtp);
/**
 * @swagger
 * /api/v1/merchants/resend-otp:
 *   post:
 *     summary: Resend OTP
 *     tags: [Merchants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - merchantId
 *               - channel
 *             properties:
 *               merchantId:
 *                 type: string
 *               channel:
 *                 type: string
 *                 enum: [email, phone]
 *     responses:
 *       200:
 *         description: OTP resent
 *       404:
 *         description: Merchant not found
 */
router.post("/resend-otp", idempotencyMiddleware, validate(merchantSchema.resendOtpSchema), resendOtp);

/**
 * @swagger
 * /api/v1/merchants/me:
 *   get:
 *     summary: Get the currently logged-in merchant
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Merchant found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 merchant:
 *                   $ref: '#/components/schemas/Merchant'
 *       401:
 *         description: Unauthorized, token missing or invalid
 *       404:
 *         description: Merchant not found
 */
router.get("/me", authenticateApiKey, getLoggedInMerchant);

/**
 * @swagger
 * /api/v1/merchants/me:
 *   patch:
 *     summary: Update merchant profile
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               business_name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 */
router.patch(
  "/me",
  authenticateApiKey,
  validate(merchantSchema.updateMerchantProfileSchema),
  updateMerchantProfile,
);

/**
 * @swagger
 * /api/v1/merchants/me/webhook:
 *   patch:
 *     summary: Update merchant webhook URL
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - webhook_url
 *             properties:
 *               webhook_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook URL updated successfully
 *       401:
 *         description: Unauthorized
 */
router.patch("/me/webhook", authenticateApiKey, updateMerchantWebhook);


/**
 * @swagger
 * /api/v1/merchants/keys/rotate-api-key:
 *   post:
 *     summary: Rotate merchant API key
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 apiKey:
 *                   type: string
 */
router.post("/keys/rotate-api-key", authenticateApiKey, rotateApiKey);

/**
 * @swagger
 * /api/v1/merchants/keys/rotate-webhook-secret:
 *   post:
 *     summary: Rotate merchant webhook secret
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Webhook secret rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 webhookSecret:
 *                   type: string
 */
router.post(
  "/keys/rotate-webhook-secret",
  authenticateApiKey,
  rotateWebhookSecret,
);

// ── Admin routes ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/merchants/admin/list:
 *   get:
 *     summary: List all merchants (Admin only)
 *     tags: [Admin - Merchants]
 *     security:
 *       - adminSecret: []
 *     responses:
 *       200:
 *         description: List of merchants
 *       401:
 *         description: Unauthorized
 */
router.get("/admin/list", adminAuth, adminListMerchants);

/**
 * @swagger
 * /api/v1/merchants/admin/{merchantId}:
 *   get:
 *     summary: Get merchant details by ID (Admin only)
 *     tags: [Admin - Merchants]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Merchant found
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Merchant not found
 */
router.get("/admin/:merchantId", adminAuth, adminGetMerchant);

/**
 * @swagger
 * /api/v1/merchants/admin/{merchantId}/status:
 *   patch:
 *     summary: Update merchant account status (Admin only)
 *     tags: [Admin - Merchants]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, active, suspended, rejected]
 *     responses:
 *       200:
 *         description: Status updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Merchant not found
 */
router.patch("/admin/:merchantId/status", adminAuth, adminUpdateMerchantStatus);
/**
 * @swagger
 * /api/v1/merchants/me/settlement-schedule:
 *   patch:
 *     summary: Update merchant settlement schedule
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - settlement_schedule
 *             properties:
 *               settlement_schedule:
 *                 type: string
 *                 enum: [daily, weekly]
 *               settlement_day:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 6
 *                 description: "0=Sun, 1=Mon … 6=Sat. Required when schedule is weekly."
 *     responses:
 *       200:
 *         description: Schedule updated
 *       400:
 *         description: Validation error (e.g. missing settlement_day for weekly)
 *       401:
 *         description: Unauthorized
 */
router.patch(
  "/me/settlement-schedule",
  authenticateApiKey,
  validate(updateSettlementScheduleSchema),
  updateSettlementSchedule,
);


/**
 * @swagger
 * /api/v1/merchants/me/bank-account:
 *   post:
 *     summary: Add or update merchant bank account
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - account_name
 *               - account_number
 *               - bank_name
 *               - currency
 *               - country
 *             properties:
 *               account_name:
 *                 type: string
 *               account_number:
 *                 type: string
 *               bank_name:
 *                 type: string
 *               bank_code:
 *                 type: string
 *               currency:
 *                 type: string
 *               country:
 *                 type: string
 *     responses:
 *       201:
 *         description: Bank account saved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Merchant not found
 */
router.post(
  "/me/bank-account",
  authenticateApiKey,
  validate(bankAccountSchema),
  addBankAccount,
);

export default router;
