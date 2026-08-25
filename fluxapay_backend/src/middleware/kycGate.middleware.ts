/**
 * kycGate.middleware.ts
 *
 * Middleware to enforce KYC verification before payment creation.
 * Blocks charge creation for merchants without approved KYC status.
 *
 * KYC Status Requirements:
 *  - approved     → Allow charge creation
 *  - pending_review, rejected, not_submitted → Block (HTTP 403)
 *
 * Admin Bypass:
 *  - Merchants marked as internal/test skip KYC check
 */

import { Response, NextFunction } from "express";
import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { AuthRequest } from "../types/express";
import { PrismaClient } from "../generated/client/client";
import { prisma } from "../config/prisma";


/**
 * Enforces KYC gate: merchant must have approved KYC status to create payments.
 * Bypasses check for internal/test merchants.
 */
export const kycGateMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const merchantId = req.merchantId;

  if (!merchantId) {
    sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized"));
    return;
  }

  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        kyc: {
          select: { kyc_status: true },
        },
      },
    });

    if (!merchant) {
      sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Merchant not found"));
      return;
    }

    const kycStatus = merchant.kyc?.kyc_status ?? "not_submitted";

    // Check KYC status
    if (kycStatus === "approved") {
      return next();
    }

    // KYC not approved - block payment creation
    const kycSubmissionUrl = `${process.env.API_BASE_URL || "http://localhost:3000"}/api/v1/merchants/kyc`;

    sendApiError(
      res,
      apiError(
        403,
        ErrorCode.KYC_REQUIRED,
        `Merchant KYC status is '${kycStatus}'. Payment creation requires approved KYC.`,
        {
          details: {
            kyc_status: kycStatus,
            kyc_submission_url: kycSubmissionUrl,
          },
        }
      )
    );
  } catch (err: any) {
    console.error(`[KYCGate] Error checking KYC status: ${err.message}`);
    sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Internal server error"));
  }
};
