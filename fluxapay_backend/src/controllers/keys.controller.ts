import { createController } from "../helpers/controller.helper";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import { regenerateApiKeyService } from "../services/merchant.service";

export const regenerateApiKey = createController(
  async (_, req: AuthRequest) => {
    const merchantId = await validateUserId(req);
    
    return regenerateApiKeyService({ merchantId });
  },
);
