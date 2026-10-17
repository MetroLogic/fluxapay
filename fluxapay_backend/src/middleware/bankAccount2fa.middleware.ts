import { NextFunction, Response } from 'express';
import { apiError, sendApiError } from '../helpers/apiError.helper';
import { validateUserId } from '../helpers/request.helper';
import { createAuditLog } from '../services/audit.service';
import { verifyOtp } from '../services/otp.service';
import { AuditActionType, AuditEntityType } from '../generated/client/client';
import { ErrorCode } from '../types/errors';
import { AuthRequest } from '../types/express';

function getVerificationCodeFromRequest(req: AuthRequest): string | undefined {
  const bodyOtp = req.body && typeof req.body === 'object' ? req.body.otp : undefined;
  const body2FA = req.body && typeof req.body === 'object' ? req.body.two_factor_code : undefined;
  const bodyVerification = req.body && typeof req.body === 'object' ? req.body.verification_code : undefined;
  const bodyChannel = req.body && typeof req.body === 'object' ? req.body.channel : undefined;
  const headerMap = req.headers ?? {};

  const headerValues = [
    headerMap['x-otp'],
    headerMap['x-2fa-code'],
    headerMap['x-two-factor-code'],
    headerMap['x-bank-account-otp'],
    headerMap['x-auth-otp'],
  ].flatMap((value) => Array.isArray(value) ? value : [value]);

  const candidate = [bodyOtp, body2FA, bodyVerification, ...headerValues]
    .find((value) => typeof value === 'string' && value.trim().length > 0);

  if (typeof candidate !== 'string') return undefined;
  return candidate.trim();
}

function getOtpChannel(req: AuthRequest): 'email' | 'phone' {
  const bodyChannel = req.body && typeof req.body === 'object' ? req.body.channel : undefined;
  const headerMap = req.headers ?? {};
  const headerValue = headerMap['x-otp-channel'] ?? headerMap['x-two-factor-channel'];
  const channel = (typeof bodyChannel === 'string' ? bodyChannel : Array.isArray(headerValue) ? headerValue[0] : headerValue) ?? 'email';

  return channel === 'phone' ? 'phone' : 'email';
}

async function logBankAccount2faAttempt(params: {
  merchantId: string;
  status: 'missing' | 'denied' | 'verified';
  reason?: string;
}): Promise<void> {
  try {
    await createAuditLog({
      admin_id: params.merchantId,
      action_type: AuditActionType.bank_account_updated,
      entity_type: AuditEntityType.bank_account,
      entity_id: params.merchantId,
      details: {
        merchant_id: params.merchantId,
        action: 'bank_account_2fa',
        status: params.status,
        reason: params.reason ?? null,
        checked_at: new Date().toISOString(),
      },
    });
  } catch {
    // Audit logging must never block the request path.
  }
}

export async function requireBankAccount2FA(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const merchantId = await validateUserId(req);
    const otp = getVerificationCodeFromRequest(req);

    if (!otp) {
      await logBankAccount2faAttempt({
        merchantId,
        status: 'missing',
        reason: 'missing_otp',
      });
      sendApiError(
        res,
        apiError(403, ErrorCode.TWO_FACTOR_REQUIRED, 'A valid verification code is required to change payout bank details.'),
      );
      return;
    }

    const channel = getOtpChannel(req);
    const result = await verifyOtp(merchantId, channel, otp);
    if (!result.success) {
      await logBankAccount2faAttempt({
        merchantId,
        status: 'denied',
        reason: result.message ?? 'invalid_otp',
      });
      sendApiError(
        res,
        apiError(403, ErrorCode.TWO_FACTOR_REQUIRED, 'A valid verification code is required to change payout bank details.'),
      );
      return;
    }

    await logBankAccount2faAttempt({
      merchantId,
      status: 'verified',
    });
    next();
  } catch (error) {
    sendApiError(res, error);
  }
}
