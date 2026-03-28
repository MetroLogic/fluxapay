import { Request, Response } from "express";
import {
  getReconciliationSummaryService,
  listDiscrepancyAlertsService,
  resolveDiscrepancyAlertService,
  upsertDiscrepancyThresholdService,
} from "../services/reconciliation.service";

export async function getReconciliationSummary(req: Request, res: Response) {
  try {
    const result = await getReconciliationSummaryService({
      merchant_id: req.query.merchant_id as string | undefined,
      period_start: req.query.period_start as string,
      period_end: req.query.period_end as string,
    });

    res.status(200).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function listDiscrepancyAlerts(req: Request, res: Response) {
  try {
    const result = await listDiscrepancyAlertsService({
      merchant_id: req.query.merchant_id as string | undefined,
      is_resolved:
        typeof req.query.is_resolved === "string"
          ? req.query.is_resolved === "true"
          : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
    });

    res.status(200).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function upsertDiscrepancyThreshold(req: Request, res: Response) {
  try {
    const result = await upsertDiscrepancyThresholdService({
      merchant_id: req.body.merchant_id,
      amount_threshold: req.body.amount_threshold,
      percent_threshold: req.body.percent_threshold,
      is_active: req.body.is_active,
    });

    res.status(200).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function resolveDiscrepancyAlert(req: Request, res: Response) {
  try {
    const result = await resolveDiscrepancyAlertService({
      alert_id: String(req.params.alert_id),
      is_resolved: req.body.is_resolved,
    });

    res.status(200).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}
