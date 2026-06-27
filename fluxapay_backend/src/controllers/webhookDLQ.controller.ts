import { Request, Response } from "express";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import {
  listWebhookDLQ,
  getWebhookDLQItem,
  replayWebhookFromDLQ,
  deleteWebhookFromDLQ,
} from "../services/webhook-dlq.service";

/**
 * GET /webhooks/dead-letter
 * List dead-letter queue items for a merchant
 */
export async function listDLQ(req: AuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = await validateUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));

    const result = await listWebhookDLQ({
      merchantId,
      page,
      limit,
    });

    res.json({
      success: true,
      data: {
        items: result.items.map(item => ({
          id: item.id,
          event_type: item.event_type,
          endpoint_url: item.endpoint_url,
          failure_reason: item.failure_reason,
          retry_count: item.retry_count,
          max_retries: item.max_retries,
          created_at: item.created_at,
          expires_at: item.expires_at,
          replayed_at: item.replayed_at,
        })),
        pagination: {
          page,
          limit,
          total: result.total,
          pages: Math.ceil(result.total / limit),
        },
      },
    });
  } catch (error: any) {
    sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to list DLQ items"));
  }
}

/**
 * GET /webhooks/dead-letter/:id
 * Get a specific DLQ item details
 */
export async function getDLQItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = await validateUserId(req);
    const { id } = req.params;

    if (!id) {
      sendApiError(res, apiError(400, ErrorCode.MISSING_REQUIRED_FIELD, "DLQ item ID is required"));
      return;
    }

    const item = await getWebhookDLQItem(id, merchantId);

    res.json({
      success: true,
      data: {
        id: item.id,
        event_type: item.event_type,
        endpoint_url: item.endpoint_url,
        failure_reason: item.failure_reason,
        last_http_status: item.last_http_status,
        request_payload: item.request_payload,
        response_body: item.response_body,
        retry_count: item.retry_count,
        max_retries: item.max_retries,
        created_at: item.created_at,
        expires_at: item.expires_at,
        replayed_at: item.replayed_at,
      },
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      sendApiError(res, apiError(404, ErrorCode.NOT_FOUND, "DLQ item not found"));
    } else if (error.message === "Unauthorized") {
      sendApiError(res, apiError(403, ErrorCode.UNAUTHORIZED, "Access denied"));
    } else {
      sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to retrieve DLQ item"));
    }
  }
}

/**
 * POST /webhooks/dead-letter/:id/replay
 * Replay a webhook from the DLQ
 */
export async function replayDLQ(req: AuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = await validateUserId(req);
    const { id } = req.params;

    if (!id) {
      sendApiError(res, apiError(400, ErrorCode.MISSING_REQUIRED_FIELD, "DLQ item ID is required"));
      return;
    }

    await replayWebhookFromDLQ(id, merchantId);

    res.json({
      success: true,
      message: "Webhook replayed from DLQ. It will be retried with the original payload.",
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      sendApiError(res, apiError(404, ErrorCode.NOT_FOUND, "DLQ item not found"));
    } else if (error.message === "Unauthorized") {
      sendApiError(res, apiError(403, ErrorCode.UNAUTHORIZED, "Access denied"));
    } else {
      sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to replay webhook"));
    }
  }
}

/**
 * DELETE /webhooks/dead-letter/:id
 * Remove a webhook from the DLQ (permanent deletion)
 */
export async function removeDLQItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = await validateUserId(req);
    const { id } = req.params;

    if (!id) {
      sendApiError(res, apiError(400, ErrorCode.MISSING_REQUIRED_FIELD, "DLQ item ID is required"));
      return;
    }

    await deleteWebhookFromDLQ(id, merchantId);

    res.json({
      success: true,
      message: "DLQ item removed permanently",
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      sendApiError(res, apiError(404, ErrorCode.NOT_FOUND, "DLQ item not found"));
    } else if (error.message === "Unauthorized") {
      sendApiError(res, apiError(403, ErrorCode.UNAUTHORIZED, "Access denied"));
    } else {
      sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to remove DLQ item"));
    }
  }
}
