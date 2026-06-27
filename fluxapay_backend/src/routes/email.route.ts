import { Router } from "express";
import { handleEmailWebhook, handleUnsubscribe } from "../controllers/email.controller";

const router = Router();

router.post("/webhook", handleEmailWebhook);
router.get("/unsubscribe", handleUnsubscribe);

export default router;
