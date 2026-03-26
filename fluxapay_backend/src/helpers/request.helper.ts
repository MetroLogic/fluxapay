import { AuthRequest } from "../types/express";

export const validateUserId = async (req: AuthRequest) => {
  const merchantId = req.merchantId || req?.user?.id;
  if (!merchantId) {
    throw { status: 401, message: "Unauthorized" };
  }
  return merchantId;
};
