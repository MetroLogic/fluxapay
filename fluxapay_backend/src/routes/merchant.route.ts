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
  updateSettlementSchedule,
} from "../controllers/merchant.controller";
import { validate } from "../middleware/validation.middleware";
import * as merchantSchema from "../schemas/merchant.schema";
import { authenticateToken } from "../middleware/auth.middleware";
import { updateSettlementScheduleSchema } from "../schemas/merchant.schema";

const router = Router();

/**
 * @swagger
 * /api/merchants/signup:
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
router.post("/signup", validate(merchantSchema.signupSchema), signupMerchant);

/**
 * @swagger
 * /api/merchants/login:
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
 * /api/merchants/verify-otp:
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
router.post("/verify-otp", validate(merchantSchema.verifyOtpSchema), verifyOtp);
/**
 * @swagger
 * /api/merchants/resend-otp:
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
router.post("/resend-otp", validate(merchantSchema.resendOtpSchema), resendOtp);

/**
 * @swagger
 * /api/merchants/me:
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
router.get("/me", authenticateToken, getLoggedInMerchant);

/**
 * @swagger
 * /api/merchants/me:
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
router.patch("/me", authenticateToken, updateMerchantProfile);

/**
 * @swagger
 * /api/merchants/me/webhook:
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
router.patch("/me/webhook", authenticateToken, updateMerchantWebhook);


/**
 * @swagger
 * /api/merchants/keys/rotate-api-key:
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
router.post("/keys/rotate-api-key", authenticateToken, rotateApiKey);

/**
 * @swagger
 * /api/merchants/keys/rotate-webhook-secret:
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
  authenticateToken,
  rotateWebhookSecret,
);

/**
 * @swagger
 * /api/merchants/me/settlement-schedule:
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
  authenticateToken,
  validate(updateSettlementScheduleSchema),
  updateSettlementSchedule,
);


export default router;
