import { Request, Response } from "express";
import z from "zod";
import * as webhookSchema from "../schemas/webhook.schema";
import {
  getWebhookLogsService,
  getWebhookLogDetailsService,
  retryWebhookService,
  sendTestWebhookService,
} from "../services/webhook.service";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";

type GetWebhookLogsQuery = z.infer<typeof webhookSchema.getWebhookLogsSchema>;
type SendTestWebhookBody = z.infer<typeof webhookSchema.sendTestWebhookSchema>;

export async function getWebhookLogs(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const query = req.query as unknown as GetWebhookLogsQuery;

    const result = await getWebhookLogsService({
      merchantId,
      event_type: query.event_type as any,
      status: query.status as any,
      date_from: query.date_from,
      date_to: query.date_to,
      search: query.search,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getWebhookLogDetails(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { log_id } = req.params;

    if (!log_id || Array.isArray(log_id)) {
      return res.status(400).json({ message: "Log ID is required" });
    }

    const result = await getWebhookLogDetailsService({
      merchantId,
      log_id,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function retryWebhook(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { log_id } = req.params;

    if (!log_id || Array.isArray(log_id)) {
      return res.status(400).json({ message: "Log ID is required" });
    }

    const result = await retryWebhookService({
      merchantId,
      log_id,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function sendTestWebhook(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const body = req.body as SendTestWebhookBody;

    const result = await sendTestWebhookService({
      merchantId,
      event_type: body.event_type as any,
      endpoint_url: body.endpoint_url,
      payload_override: body.payload_override,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}
