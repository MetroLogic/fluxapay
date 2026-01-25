import { AuthRequest } from "../types/express";

export const validateUserId = async (req: AuthRequest) => {
  if (!req?.user?.id) {
    throw { status: 401, message: "Unauthorized" };
  }
  return req.user.id;
};
