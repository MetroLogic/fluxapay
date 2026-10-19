import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import z from "zod";
import * as webhookSchema from "../schemas/webhook.schema";
import {
  getWebhookLogsService,
  getWebhookLogDetailsService,
  retryWebhookService,
  sendTestWebhookService,
  getDeadLetterQueueService,
  requeueWebhookService,
  exportWebhookLogsService,
  adminGetWebhookLogsService,
  adminRetryWebhookService,
  getWebhookRetryConfigService,
  getWebhookDeliveryAttemptsService,
  initiateWebhookKeyRotation,
  promoteSecondaryWebhookKey,
  revokeSecondaryWebhookKey,
  getWebhookKeyStatusService,
} from "../services/webhook.service";
import { WebhookEventType, WebhookStatus } from "../generated/client/client";
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
      event_type: query.event_type as WebhookEventType | undefined,
      status: query.status as WebhookStatus | undefined,
      date_from: query.date_from,
      date_to: query.date_to,
      search: query.search,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    sendApiError(res, err);
  }
}

/* ── Webhook retry / backoff endpoints ──────────────────────────────────── */

export async function getWebhookRetryConfig(req: Request, res: Response) {
  try {
    const result = await getWebhookRetryConfigService();
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

export async function getWebhookDeliveryAttempts(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { log_id } = req.params;

    if (!log_id || Array.isArray(log_id)) {
      return sendApiError(res, apiError(400, ErrorCode.LOG_ID_REQUIRED, "Log ID is required"));
    }

    const result = await getWebhookDeliveryAttemptsService({
      merchantId,
      log_id,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

export async function exportWebhookLogs(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const query = req.query as Record<string, string | undefined>;

    const result = await exportWebhookLogsService({
      merchantId,
      event_type: query.event_type as WebhookEventType | undefined,
      status: query.status as WebhookStatus | undefined,
      date_from: query.date_from,
      date_to: query.date_to,
      search: query.search,
    });

    res.setHeader("Content-Type", result.contentType);
    res.attachment(result.filename);
    return res.status(200).send(result.content);
  } catch (err) {
    console.error(err);
    sendApiError(res, err);
  }
}

export async function getWebhookLogDetails(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { log_id } = req.params;

    if (!log_id || Array.isArray(log_id)) {
      return sendApiError(res, apiError(400, ErrorCode.LOG_ID_REQUIRED, "Log ID is required"));
    }

    const result = await getWebhookLogDetailsService({
      merchantId,
      log_id,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

export async function retryWebhook(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { log_id } = req.params;

    if (!log_id || Array.isArray(log_id)) {
      return sendApiError(res, apiError(400, ErrorCode.LOG_ID_REQUIRED, "Log ID is required"));
    }

    const result = await retryWebhookService({
      merchantId,
      log_id,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

export async function sendTestWebhook(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const body = req.body as SendTestWebhookBody;

    const result = await sendTestWebhookService({
      merchantId,
      event_type: body.event_type as WebhookEventType,
      endpoint_url: body.endpoint_url,
      payload_override: body.payload_override,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    sendApiError(res, err);
  }
}

/* ── Admin DLQ endpoints (X-Admin-Secret, not merchant JWT) ─────────────── */

export async function getDeadLetterQueue(req: Request, res: Response) {
  try {
    const query = req.query as any;

    const result = await getDeadLetterQueueService({
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
      date_from: query.date_from,
      date_to: query.date_to,
      merchant_id: query.merchant_id,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

export async function requeueWebhook(req: Request, res: Response) {
  try {
    const { log_id } = req.params;

    if (!log_id || Array.isArray(log_id)) {
      return sendApiError(res, apiError(400, ErrorCode.LOG_ID_REQUIRED, "Log ID is required"));
    }

    const result = await requeueWebhookService({ log_id });
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

export async function adminGetWebhookLogs(req: Request, res: Response) {
  try {
    const query = req.query as any;
    const result = await adminGetWebhookLogsService({
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
      date_from: query.date_from,
      date_to: query.date_to,
      merchant_id: query.merchant_id,
      event_type: query.event_type as WebhookEventType | undefined,
      status: query.status as WebhookStatus | undefined,
      search: query.search,
    });
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

export async function adminRetryWebhook(req: Request, res: Response) {
  try {
    const { log_id } = req.params;

    if (!log_id || Array.isArray(log_id)) {
      return sendApiError(res, apiError(400, ErrorCode.LOG_ID_REQUIRED, "Log ID is required"));
    }

    const result = await adminRetryWebhookService({ log_id });
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

/* ── Retry-with-backoff alias (route alias for retryWebhook) ─────────────── */

/** Alias used by the route file; delegates to retryWebhook. */
export const retryWebhookWithBackoff = retryWebhook;

/* ── Delivery-attempt history ─────────────────────────────────────────────── */

export async function getWebhookAttempts(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { log_id } = req.params;

    if (!log_id || Array.isArray(log_id)) {
      return sendApiError(res, apiError(400, ErrorCode.LOG_ID_REQUIRED, "Log ID is required"));
    }

    const result = await getWebhookDeliveryAttemptsService({ merchantId, log_id });
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

/* ── Webhook key rotation endpoints ──────────────────────────────────────── */

/**
 * POST /api/v1/webhooks/keys/rotate
 *
 * Initiates a webhook secret rotation. Generates a new secondary secret that
 * is used alongside the primary for dual-signing during the grace window.
 * Returns the new secondary secret (shown only once — store it securely).
 */
export async function initiateWebhookRotation(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await initiateWebhookKeyRotation(merchantId);
    res.status(201).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

/**
 * POST /api/v1/webhooks/keys/promote
 *
 * Promotes the pending secondary secret to primary, retiring the old primary.
 * Must be called after the merchant has updated their webhook handler to accept
 * both signatures.
 */
export async function promoteWebhookKey(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await promoteSecondaryWebhookKey(merchantId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

/**
 * DELETE /api/v1/webhooks/keys/secondary
 *
 * Revokes the pending secondary secret without promoting it.
 * Cancels the rotation and restores single-key signing with the primary.
 */
export async function revokeWebhookKey(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await revokeSecondaryWebhookKey(merchantId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}

/**
 * GET /api/v1/webhooks/keys/status
 *
 * Returns whether a rotation is in progress and when the secondary key was
 * created. Does not expose raw secret values.
 */
export async function getWebhookKeyStatus(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await getWebhookKeyStatusService(merchantId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    sendApiError(res, err);
  }
}
