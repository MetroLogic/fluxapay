import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { AuthRequest } from "../types/express";

export const validateUserId = async (req: AuthRequest) => {
  const merchantId = req.merchantId || req?.user?.id;
  if (!merchantId) {
    throw apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized");
  }
  return merchantId;
};
