import { Router } from "express";
import {
  signupMerchant,
  loginMerchant,
  verifyOtp,
  resendOtp,
  forgotPassword,
  validateResetToken,
  resetPassword,
  getLoggedInMerchant,
  updateMerchantProfile,
  updateMerchantWebhook,
  rotateApiKey,
  rotateWebhookSecret,
  adminListMerchants,
  adminGetMerchant,
  adminUpdateMerchantStatus,
  adminBulkUpdateMerchantStatus,
  adminUpdateMerchantWebhook,
  updateSettlementSchedule,
  addBankAccount,
  updateBankAccount,
  getNotificationPreferencesController,
  updateNotificationPreferencesController,
} from "../controllers/merchant.controller";
import { validate, validateQuery } from "../middleware/validation.middleware";
import { getMerchantAuditLogs, adminGetMerchantAuditLogs } from "../controllers/apiKeyAudit.controller";
import { getPayoutMethods, postPayoutMethod, deletePayoutMethod } from "../controllers/payoutMethod.controller";
import * as merchantSchema from "../schemas/merchant.schema";
import { authenticateApiKey } from "../middleware/apiKeyAuth.middleware";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware";
import { adminAuth } from "../middleware/adminAuth.middleware";
import { updateSettlementScheduleSchema, bankAccountSchema, updateBankAccountSchema, updateNotificationPreferencesSchema } from "../schemas/merchant.schema";
import { authRateLimit, merchantApiKeyRateLimit, merchantRateLimit } from "../middleware/rateLimit.middleware";

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
router.post("/signup", idempotencyMiddleware, authRateLimit(), validate(merchantSchema.signupSchema), signupMerchant);

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
router.post("/login", authRateLimit(), validate(merchantSchema.loginSchema), loginMerchant);

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
router.post("/verify-otp", idempotencyMiddleware, authRateLimit(), validate(merchantSchema.verifyOtpSchema), verifyOtp);
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
router.post("/resend-otp", idempotencyMiddleware, authRateLimit(), validate(merchantSchema.resendOtpSchema), resendOtp);

/**
 * @swagger
 * /api/v1/merchants/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Merchants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Generic acknowledgement (never reveals whether the email is registered)
 */
router.post(
  "/forgot-password",
  authRateLimit(),
  validate(merchantSchema.forgotPasswordSchema),
  forgotPassword,
);

/**
 * @swagger
 * /api/v1/merchants/validate-reset-token:
 *   get:
 *     summary: Check whether a password reset token is currently valid (does not consume it)
 *     tags: [Merchants]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token validity
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 */
router.get(
  "/validate-reset-token",
  authRateLimit(),
  validateQuery(merchantSchema.validateResetTokenQuerySchema),
  validateResetToken,
);

/**
 * @swagger
 * /api/v1/merchants/reset-password:
 *   post:
 *     summary: Reset password using a single-use reset token
 *     tags: [Merchants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid, expired, or already-used token
 */
router.post(
  "/reset-password",
  idempotencyMiddleware,
  authRateLimit(),
  validate(merchantSchema.resetPasswordSchema),
  resetPassword,
);

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
router.get("/me", authenticateApiKey, merchantApiKeyRateLimit(), getLoggedInMerchant);

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
  authenticateApiKey, merchantApiKeyRateLimit(),
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
router.patch("/me/webhook", authenticateApiKey, merchantApiKeyRateLimit(), updateMerchantWebhook);


/**
 * @swagger
 * /api/v1/merchants/keys/rotate-api-key:
 *   post:
 *     summary: Rotate merchant API key
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               gracePeriodHours:
 *                 type: number
 *                 minimum: 0.01
 *                 description: Hours the previous key remains valid (default 24).
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
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                 gracePeriodHours:
 *                   type: number
 */
router.post("/keys/rotate-api-key", authenticateApiKey, merchantApiKeyRateLimit(), merchantRateLimit(), rotateApiKey);

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
  authenticateApiKey, merchantApiKeyRateLimit(),
  merchantRateLimit(),
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
/**
 * @swagger
 * /api/v1/merchants/payout-methods:
 *   get:
 *     operationId: listPayoutMethods
 *     summary: List the merchant's payout methods
 *     description: Bank accounts used for fiat settlement. Account and routing numbers are always masked.
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: include_archived
 *         description: Also return archived payout methods.
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Payout methods
 *       401:
 *         description: Unauthorized
 *   post:
 *     operationId: createPayoutMethod
 *     summary: Add a payout bank account
 *     description: Validated against the settlement country's rules (NG, KE, GH, ZA, US, GB). Stored encrypted with status pending_verification.
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [country, beneficiary_name, account_number]
 *             properties:
 *               country: { type: string, example: NG }
 *               currency: { type: string, example: NGN }
 *               beneficiary_name: { type: string, example: Acme Coffee Ltd }
 *               account_number: { type: string, example: "0123456789" }
 *               bank_code: { type: string, example: "058" }
 *               routing_number: { type: string, description: Required for US accounts (ABA). }
 *               bank_name: { type: string }
 *               label: { type: string }
 *               is_default: { type: boolean }
 *     responses:
 *       201:
 *         description: Payout method created (masked)
 *       400:
 *         description: Validation failed
 *       409:
 *         description: Account already configured
 *       422:
 *         description: Payout method limit reached
 */
router.get("/payout-methods", authenticateApiKey, merchantApiKeyRateLimit(), getPayoutMethods);
router.post("/payout-methods", authenticateApiKey, merchantApiKeyRateLimit(), postPayoutMethod);

/**
 * @swagger
 * /api/v1/merchants/payout-methods/{id}:
 *   delete:
 *     operationId: deletePayoutMethod
 *     summary: Archive a payout method
 *     description: Soft-deletes the method (status archived) so settlement history keeps its reference.
 *     tags: [Merchants]
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique identifier of the payout method.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Archived payout method
 *       404:
 *         description: Not found for this merchant
 *       409:
 *         description: Already archived
 */
router.delete("/payout-methods/:id", authenticateApiKey, merchantApiKeyRateLimit(), deletePayoutMethod);

/**
 * @swagger
 * /api/v1/merchants/audit-logs:
 *   get:
 *     operationId: getMerchantApiKeyAuditLogs
 *     summary: API key audit trail for the authenticated merchant
 *     description: Append-only record of API key creation, rotation, regeneration and revocation. Requires the account owner's dashboard (JWT) session; API keys cannot read it.
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         description: Page number to return (1-indexed).
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         description: Maximum number of items to return per page (max 100).
 *         schema: { type: integer }
 *       - in: query
 *         name: action
 *         description: Filter by lifecycle action.
 *         schema: { type: string, enum: [created, updated, rotated, revoked, regenerated] }
 *       - in: query
 *         name: api_key_id
 *         description: Only entries for this API key.
 *         schema: { type: string }
 *       - in: query
 *         name: date_from
 *         description: Only entries at or after this time (ISO 8601).
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: date_to
 *         description: Only entries at or before this time (ISO 8601).
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Paginated audit entries (merchant, actor, action, IP, user agent, key prefix, last four, timestamp)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not the account owner's dashboard session
 */
router.get("/audit-logs", authenticateApiKey, merchantApiKeyRateLimit(), getMerchantAuditLogs);

/**
 * @swagger
 * /api/v1/merchants/admin/{merchantId}/audit-logs:
 *   get:
 *     operationId: adminGetMerchantApiKeyAuditLogs
 *     summary: API key audit trail for a merchant (Admin only)
 *     tags: [Admin - Merchants]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         description: Unique identifier of the merchant.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated audit entries
 *       401:
 *         description: Unauthorized
 */
router.get("/admin/:merchantId/audit-logs", adminAuth, adminGetMerchantAuditLogs);

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
 * /api/v1/merchants/admin/{merchantId}/webhook:
 *   patch:
 *     summary: Update merchant webhook URL (Admin only)
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
 *             required: [webhook_url]
 *             properties:
 *               webhook_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook URL updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Merchant not found
 */
router.patch("/admin/:merchantId/webhook", adminAuth, adminUpdateMerchantWebhook);

/**
 * @swagger
 * /api/v1/merchants/admin/bulk-status:
 *   post:
 *     summary: Bulk suspend or activate merchants (Admin only)
 *     tags: [Admin - Merchants]
 *     security:
 *       - adminSecret: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [merchantIds, status, reason]
 *             properties:
 *               merchantIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [active, suspended]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bulk update result with per-merchant success/failure
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/admin/bulk-status", adminAuth, adminBulkUpdateMerchantStatus);
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
  authenticateApiKey, merchantApiKeyRateLimit(),
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
  authenticateApiKey, merchantApiKeyRateLimit(),
  validate(bankAccountSchema),
  addBankAccount,
);

/**
 * @swagger
 * /api/v1/merchants/me/bank-account:
 *   patch:
 *     summary: Update existing bank account details
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
 *       200:
 *         description: Bank account updated
 *       400:
 *         description: Validation error (e.g. currency/country mismatch)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No bank account found (use POST to create)
 */
router.patch(
  "/me/bank-account",
  authenticateApiKey, merchantApiKeyRateLimit(),
  validate(updateBankAccountSchema),
  updateBankAccount,
);

/**
 * @swagger
 * /api/v1/merchants/me/notification-preferences:
 *   get:
 *     summary: Get merchant notification preferences
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current notification preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 preferences:
 *                   type: object
 *                   properties:
 *                     merchantId:
 *                       type: string
 *                     payment_expiry_reminder:
 *                       type: boolean
 *                       description: Whether to receive payment-expiry reminder notifications
 *                     reminder_minutes_before:
 *                       type: integer
 *                       description: How many minutes before expiry to send the reminder
 *                     notify_on_payment:
 *                       type: boolean
 *                       description: Whether to receive an email when a payment is successfully confirmed
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/me/notification-preferences",
  authenticateApiKey, merchantApiKeyRateLimit(),
  getNotificationPreferencesController,
);

/**
 * @swagger
 * /api/v1/merchants/me/notification-preferences:
 *   patch:
 *     summary: Update merchant notification preferences
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
 *               payment_expiry_reminder:
 *                 type: boolean
 *                 description: Set to false to opt out of payment-expiry reminders
 *               reminder_minutes_before:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1440
 *                 description: Minutes before expiry to send the reminder (1–1440)
 *               notify_on_payment:
 *                 type: boolean
 *                 description: Set to false to stop receiving payment confirmation emails
 *     responses:
 *       200:
 *         description: Preferences updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.patch(
  "/me/notification-preferences",
  authenticateApiKey, merchantApiKeyRateLimit(),
  validate(updateNotificationPreferencesSchema),
  updateNotificationPreferencesController,
);

export default router;
