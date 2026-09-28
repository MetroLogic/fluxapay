import { Router } from "express";
import { handleEmailWebhook, handleUnsubscribe } from "../controllers/email.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/email/webhook:
 *   post:
 *     summary: Handle inbound email provider webhook events
 *     tags: [Email]
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook payload
 * /api/v1/email/unsubscribe:
 *   get:
 *     summary: Unsubscribe from email notifications
 *     tags: [Email]
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 *       400:
 *         description: Invalid or missing token
 */
router.post("/webhook", handleEmailWebhook);
router.get("/unsubscribe", handleUnsubscribe);

export default router;
