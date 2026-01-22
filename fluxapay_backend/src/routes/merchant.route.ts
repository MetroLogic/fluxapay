import { Router } from "express";
import {
  signupMerchant,
  loginMerchant,
  verifyOtp,
  resendOtp,
  getLoggedInMerchant,
} from "../controllers/merchant.controller";
import { validate } from "../middleware/validation.middleware";
import * as merchantSchema from "../schemas/merchant.schema";
import { authenticateToken } from "../middleware/auth.middleware";

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
export default router;
