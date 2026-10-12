import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import {
  createPaymentLinkService,
  getPaymentLinkByIdService,
  listPaymentLinksService,
  updatePaymentLinkService,
  deletePaymentLinkService,
  getPaymentLinkBySlugService,
  createChargeFromPaymentLinkService,
} from "../services/paymentLink.service";

export async function createPaymentLink(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await createPaymentLinkService({
      merchantId,
      title: req.body.title,
      description: req.body.description,
      amount: req.body.amount,
      currency: req.body.currency,
      redirect_url: req.body.redirect_url,
      expiry: req.body.expiry,
      metadata: req.body.metadata,
      customer_id: req.body.customer_id,
    });
    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function getPaymentLinkById(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await getPaymentLinkByIdService({
      merchantId,
      id: String(req.params.id),
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function listPaymentLinks(req: Request, res: Response) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const q = req.query as Record<string, unknown>;
    const result = await listPaymentLinksService({
      merchantId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
      active: q.active !== undefined ? q.active === "true" : undefined,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function updatePaymentLink(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await updatePaymentLinkService({
      merchantId,
      id: String(req.params.id),
      title: req.body.title,
      description: req.body.description,
      redirect_url: req.body.redirect_url,
      active: req.body.active,
      metadata: req.body.metadata,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function deletePaymentLink(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    await deletePaymentLinkService({
      merchantId,
      id: String(req.params.id),
    });
    res.status(204).send();
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

/**
 * GET /api/v1/payment-links/resolve/:slug
 * Public endpoint — resolves a payment link by slug.
 * Returns 410 Gone if the link is expired or inactive.
 */
export async function resolvePaymentLinkBySlug(req: Request, res: Response) {
  try {
    const slug = String(req.params.slug);
    const paymentLink = await getPaymentLinkBySlugService(slug);

    const checkoutBase = process.env.PAY_CHECKOUT_BASE || process.env.BASE_URL || "http://localhost:3000";
    const shortUrl = `${checkoutBase.replace(/\/$/, "")}/pay/${paymentLink.slug}`;

    res.status(200).json({
      id: paymentLink.id,
      slug: paymentLink.slug,
      title: paymentLink.title,
      description: paymentLink.description,
      amount: paymentLink.amount ? Number(paymentLink.amount) / 100 : null,
      currency: paymentLink.currency,
      expiry: paymentLink.expiry,
      merchant: paymentLink.merchant
        ? {
            business_name: paymentLink.merchant.business_name,
            checkout_logo_url: paymentLink.merchant.checkout_logo_url,
            checkout_accent_color: paymentLink.merchant.checkout_accent_color,
          }
        : null,
      short_url: shortUrl,
    });
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}

/**
 * POST /api/v1/payment-links/resolve/:slug/charge
 * Public endpoint — creates a payment charge from a payment link.
 * Validates expiry and active status before creating the charge.
 */
export async function chargeFromPaymentLink(req: Request, res: Response) {
  try {
    const slug = String(req.params.slug);

    // Resolve slug to get the link (enforces expiry + active checks)
    const paymentLink = await getPaymentLinkBySlugService(slug);

    const payment = await createChargeFromPaymentLinkService({
      paymentLinkId: paymentLink.id,
      amount: req.body.amount,
      customer_email: req.body.customer_email,
    });

    const checkoutBase = process.env.PAY_CHECKOUT_BASE || process.env.BASE_URL || "http://localhost:3000";

    res.status(201).json({
      id: payment.id,
      amount: Number(payment.amount) / 100,
      currency: payment.currency,
      status: payment.status,
      checkout_url: payment.checkout_url || `${checkoutBase.replace(/\/$/, "")}/pay/${payment.id}`,
    });
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}
