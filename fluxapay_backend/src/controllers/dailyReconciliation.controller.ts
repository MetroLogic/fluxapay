import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import {
  generateDailyReconciliationReportService,
  listDailyReconciliationReportsService,
  getDailyReconciliationReportService,
  generateReconciliationCsvService,
  emailDailyReconciliationReportService,
} from "../services/dailyReconciliation.service";

export async function generateDailyReconciliationReport(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { date } = req.body;
    const reportDate = date ? new Date(date) : new Date();

    const result = await generateDailyReconciliationReportService({ merchantId, reportDate });
    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function listDailyReconciliationReports(req: Request, res: Response) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const q = req.query as Record<string, unknown>;
    const result = await listDailyReconciliationReportsService({
      merchantId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
      startDate: q.start_date ? new Date(q.start_date as string) : undefined,
      endDate: q.end_date ? new Date(q.end_date as string) : undefined,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function getDailyReconciliationReport(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { date } = req.params;
    const reportDate = new Date(Array.isArray(date) ? date[0] : date);

    const result = await getDailyReconciliationReportService({ merchantId, reportDate });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function getDailyReconciliationReportCsv(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { date } = req.params;
    const reportDate = new Date(Array.isArray(date) ? date[0] : date);

    const result = await generateReconciliationCsvService({ merchantId, reportDate });

    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", "text/csv");
    res.send(result.content);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function emailDailyReconciliationReport(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { date } = req.params;
    const reportDate = new Date(Array.isArray(date) ? date[0] : date);

    const result = await emailDailyReconciliationReportService({ merchantId, reportDate });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}
