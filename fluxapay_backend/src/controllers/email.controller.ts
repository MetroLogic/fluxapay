import { Request, Response } from "express";
import {
  addEmailSuppression,
  ingestBounceEvents,
} from "../services/emailSuppression.service";

export async function handleEmailWebhook(req: Request, res: Response): Promise<void> {
  try {
    const ingested = await ingestBounceEvents(req.body);
    res.status(200).json({ success: true, ingested });
  } catch (err) {
    console.error("Email webhook ingestion failed:", err);
    res.status(500).json({ success: false, message: "Failed to process email webhook" });
  }
}

export async function handleUnsubscribe(req: Request, res: Response): Promise<void> {
  const email = typeof req.query.email === "string" ? req.query.email : undefined;

  if (!email) {
    res.status(400).json({ success: false, message: "email query parameter is required" });
    return;
  }

  try {
    await addEmailSuppression(email, "unsubscribe", "unsubscribe_link");
    res.status(200).json({
      success: true,
      message: "You have been unsubscribed from FluxaPay merchant notification emails.",
    });
  } catch (err) {
    console.error("Unsubscribe failed:", err);
    res.status(500).json({ success: false, message: "Failed to process unsubscribe request" });
  }
}
