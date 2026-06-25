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
      return res.status(400).json({ error: "name is required and must be a string" });
    }

    if (environment !== "live" && environment !== "test") {
      return res.status(400).json({ error: "environment must be 'live' or 'test'" });
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
        return res.status(429).json({ error: error.message });
      }
      if (error.message.includes("Maximum active keys")) {
        return res.status(422).json({ error: error.message });
      }
    }
    console.error("Error creating API key:", error);
    res.status(500).json({ error: "Failed to create API key" });
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
    res.status(500).json({ error: "Failed to list API keys" });
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
        return res.status(404).json({ error: "API key not found" });
      }
      if (error.message === "API key is already revoked") {
        return res.status(400).json({ error: "API key is already revoked" });
      }
    }
    console.error("Error revoking API key:", error);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
};
