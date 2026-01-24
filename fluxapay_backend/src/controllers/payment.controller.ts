import { Request, Response } from "express";
import {
  listPaymentsService,
  getPaymentDetailsService,
  exportPaymentsService,
} from "../services/payment.service";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import * as paymentSchema from "../schemas/payment.schema";

export async function getPaymentsList(
  req: Request<{}, {}, {}, paymentSchema.ListPaymentsQuery>,
  res: Response,
) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);

    // Parse and validate query parameters
    const validatedQuery = paymentSchema.listPaymentsQuerySchema.parse(
      req.query,
    );

    const result = await listPaymentsService(merchantId, validatedQuery);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
}

export async function getPaymentDetails(
  req: Request<{ paymentId: string }>,
  res: Response,
) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const { paymentId } = req.params;

    const payment = await getPaymentDetailsService(merchantId, paymentId);
    res.status(200).json(payment);
  } catch (err: any) {
    console.error(err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
}

export async function exportPayments(
  req: Request<{}, {}, {}, paymentSchema.ExportPaymentsQuery>,
  res: Response,
) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);

    // Parse and validate query parameters
    const validatedQuery = paymentSchema.exportPaymentsQuerySchema.parse(
      req.query,
    );

    const format = (validatedQuery.format || "csv") as "csv";
    const csvContent = await exportPaymentsService(merchantId, validatedQuery, format);

    // Set response headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payments-export-${new Date().toISOString().split("T")[0]}.csv"`,
    );

    res.send(csvContent);
  } catch (err: any) {
    console.error(err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
}
