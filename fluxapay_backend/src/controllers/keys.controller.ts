import { createController } from "../helpers/controller.helper";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import { regenerateApiKeyService } from "../services/merchant.service";
import { ApiKeyMode } from "../helpers/crypto.helper";

export const regenerateApiKey = createController(
  async (body: { mode?: string; gracePeriodHours?: number }, req: AuthRequest) => {
    const merchantId = await validateUserId(req);

    // Optional mode param (query or body) selects the key environment:
    // "live" (default, sk_live_) or "test" (sk_test_).
    const modeParam = body.mode;
    const mode: ApiKeyMode = modeParam === "test" ? "test" : "live";

    return regenerateApiKeyService({ merchantId, mode, gracePeriodHours: body.gracePeriodHours });
  },
);
