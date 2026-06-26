import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { apiKeyService } from "../services/apiKey.service";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";

/**
 * POST /v1/api-keys
 * Create a new API key.
 */
export const createApiKey = async (req: Request, res: Response) => {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const { name, environment } = req.body;

    if (!name || typeof name !== "string") {
      return sendApiError(res, apiError(400, ErrorCode.MISSING_REQUIRED_FIELD, "name is required and must be a string"));
    }

    if (environment !== "live" && environment !== "test") {
      return sendApiError(res, apiError(400, ErrorCode.INVALID_ENVIRONMENT, "environment must be 'live' or 'test'"));
    }

    const result = await apiKeyService.createApiKey(
      merchantId,
      name,
      environment,
      merchantId, // actor is the merchant themselves
    );

    res.status(201).json(result);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.includes("Rate limit exceeded")) {
        return sendApiError(
          res,
          apiError(429, ErrorCode.API_KEY_RATE_LIMIT, error.message),
        );
      }
      if (error.message.includes("Maximum active keys")) {
        return sendApiError(
          res,
          apiError(422, ErrorCode.MAX_ACTIVE_KEYS, error.message),
        );
      }
    }
    console.error("Error creating API key:", error);
    sendApiError(res, apiError(500, ErrorCode.API_KEY_CREATE_FAILED, "Failed to create API key"));
  }
};

/**
 * GET /v1/api-keys
 * List API keys for the authenticated merchant.
 */
export const listApiKeys = async (req: Request, res: Response) => {
  try {
    const merchantId = await validateUserId(req as AuthRequest);

    const apiKeys = await apiKeyService.listApiKeys(merchantId);

    res.json({ data: apiKeys });
  } catch (error: unknown) {
    console.error("Error listing API keys:", error);
    sendApiError(res, apiError(500, ErrorCode.API_KEY_LIST_FAILED, "Failed to list API keys"));
  }
};

/**
 * DELETE /v1/api-keys/:id
 * Revoke an API key.
 */
export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const keyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    await apiKeyService.revokeApiKey(merchantId, keyId, merchantId);

    res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "API key not found") {
        return sendApiError(res, apiError(404, ErrorCode.API_KEY_NOT_FOUND, "API key not found"));
      }
      if (error.message === "API key is already revoked") {
        return sendApiError(res, apiError(400, ErrorCode.API_KEY_ALREADY_REVOKED, "API key is already revoked"));
      }
    }
    console.error("Error revoking API key:", error);
    sendApiError(res, apiError(500, ErrorCode.API_KEY_REVOKE_FAILED, "Failed to revoke API key"));
  }
};
