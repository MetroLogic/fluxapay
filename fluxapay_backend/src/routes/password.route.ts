import { Router } from "express";
import { validate } from "../middleware/validation.middleware";
import * as passwordSchema from "../schemas/password.schema";
import { forgotPassword, resetPassword, validateResetToken } from "../controllers/password.controller";
import { forgotPasswordRateLimit, resetPasswordRateLimit } from "../middleware/rateLimit.middleware";

const router = Router();

/**
 * @swagger
 * /password/forgot-password:
 *   post:
 *     summary: Request a password reset
 *     tags: [Password]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       400:
 *         description: Invalid email
 *       429:
 *         description: Too many requests
 */
router.post("/forgot-password", forgotPasswordRateLimit(), validate(passwordSchema.forgotPasswordSchema), forgotPassword);

/**
 * @swagger
 * /password/validate-reset-token:
 *   post:
 *     summary: Validate a password reset token
 *     tags: [Password]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token is valid
 *       400:
 *         description: Invalid or expired token
 */
router.post("/validate-reset-token", validate(passwordSchema.validateResetTokenSchema), validateResetToken);

/**
 * @swagger
 * /password/reset-password:
 *   post:
 *     summary: Reset password with valid token
 *     tags: [Password]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid token or password
 *       429:
 *         description: Too many requests
 */
router.post("/reset-password", resetPasswordRateLimit(), validate(passwordSchema.resetPasswordSchema), resetPassword);

export default router;
