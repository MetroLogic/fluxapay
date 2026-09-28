import { Router } from "express";
import { validate } from "../middleware/validation.middleware";
import * as passwordSchema from "../schemas/password.schema";
import { forgotPassword, resetPassword, validateResetToken } from "../controllers/password.controller";
import { forgotPasswordRateLimit, resetPasswordRateLimit } from "../middleware/rateLimit.middleware";

const router = Router();

router.post("/forgot-password", forgotPasswordRateLimit(), validate(passwordSchema.forgotPasswordSchema), forgotPassword);
router.post("/validate-reset-token", validate(passwordSchema.validateResetTokenSchema), validateResetToken);
router.post("/reset-password", resetPasswordRateLimit(), validate(passwordSchema.resetPasswordSchema), resetPassword);

export default router;
