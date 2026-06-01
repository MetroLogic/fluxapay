import { Router } from "express";
import {
  login,
  refresh,
  logout,
  logoutAll,
  checkLockoutStatus,
} from "../controllers/auth.controller";
import { validate } from "../middleware/validation.middleware";
import { authRateLimit } from "../middleware/rateLimit.middleware";
import { authenticateToken } from "../middleware/auth.middleware";
import * as authSchema from "../schemas/auth.schema";

const router = Router();

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Authentication]
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
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 merchantId:
 *                   type: string
 *                 access_token:
 *                   type: string
 *                 refresh_token:
 *                   type: string
 *                 expires_in:
 *                   type: integer
 *                   description: Access token expiry in seconds (900 = 15 minutes)
 *       400:
 *         description: Invalid credentials
 *       403:
 *         description: Account not active
 *       429:
 *         description: Account locked due to too many failed attempts
 */
router.post(
  "/login",
  authRateLimit(),
  validate(authSchema.loginSchema),
  login
);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 refresh_token:
 *                   type: string
 *                 expires_in:
 *                   type: integer
 *       401:
 *         description: Invalid or expired refresh token
 *       403:
 *         description: Security incident detected, all sessions invalidated
 */
router.post(
  "/refresh",
  validate(authSchema.refreshSchema),
  refresh
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout by invalidating the current refresh token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post(
  "/logout",
  validate(authSchema.logoutSchema),
  logout
);

/**
 * @swagger
 * /api/v1/auth/logout-all:
 *   post:
 *     summary: Logout from all devices by invalidating all refresh tokens
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices
 *       401:
 *         description: Authentication required
 */
router.post(
  "/logout-all",
  authenticateToken,
  logoutAll
);

/**
 * @swagger
 * /api/v1/auth/check-lockout:
 *   post:
 *     summary: Check if an account is currently locked
 *     tags: [Authentication]
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
 *         description: Lockout status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 locked:
 *                   type: boolean
 *                 retryAfter:
 *                   type: integer
 *                   description: Seconds until lockout expires (if locked)
 */
router.post(
  "/check-lockout",
  validate(authSchema.checkLockoutSchema),
  checkLockoutStatus
);

export default router;
