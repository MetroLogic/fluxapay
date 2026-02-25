import { PrismaClient, ReconciliationStatus, AlertSeverity, ReconciliationAlertType, Prisma } from "../generated/client/client";

const prisma = new PrismaClient();

// Configurable threshold (percentage)
const DISCREPANCY_THRESHOLD_PERCENT = 1.0; // 1% threshold triggers alert

interface RunReconciliationParams {
    periodStart: string;
    periodEnd: string;
    actualBalance?: number;
}

interface ListReconciliationParams {
    page: number;
    limit: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
}

/**
 * Run a reconciliation for a given period.
 * Compares total USDC swept against total fiat payouts + fees.
 */
export const runReconciliationService = async (params: RunReconciliationParams) => {
    const { periodStart, periodEnd, actualBalance } = params;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    // Get all settlements in the period
    const settlements = await prisma.settlement.findMany({
        where: {
            created_at: { gte: start, lte: end },
        },
        include: { merchant: true },
    });

    // Get all confirmed payments in the period
    const payments = await prisma.payment.findMany({
        where: {
            createdAt: { gte: start, lte: end },
            status: "confirmed",
        },
    });

    // Calculate totals
    const totalUsdcSwept = payments.reduce(
        (sum: number, p: typeof payments[number]) => sum + Number(p.amount),
        0
    );

    const totalFiatPayouts = settlements
        .filter((s: typeof settlements[number]) => s.status === "completed")
        .reduce((sum: number, s: typeof settlements[number]) => sum + Number(s.amount), 0);

    const totalFees = settlements
        .filter((s: typeof settlements[number]) => s.status === "completed")
        .reduce((sum: number, s: typeof settlements[number]) => sum + Number(s.fees), 0);

    // Expected = total USDC swept (what we received)
    // Actual = total fiat payouts + fees (what we paid out)
    const expectedBalance = totalUsdcSwept;
    const computedActualBalance = totalFiatPayouts + totalFees;
    const finalActualBalance = actualBalance ?? computedActualBalance;

    const discrepancy = Math.abs(expectedBalance - finalActualBalance);
    const discrepancyPercent =
        expectedBalance > 0
            ? (discrepancy / expectedBalance) * 100
            : 0;

    // Determine status
    let status: ReconciliationStatus = "matched";
    if (discrepancyPercent > DISCREPANCY_THRESHOLD_PERCENT) {
        status = "discrepancy";
    }

    // Create reconciliation record
    const record = await prisma.reconciliationRecord.create({
        data: {
            period_start: start,
            period_end: end,
            total_usdc_swept: totalUsdcSwept,
            total_fiat_payouts: totalFiatPayouts,
            total_fees: totalFees,
            expected_balance: expectedBalance,
            actual_balance: finalActualBalance,
            discrepancy: discrepancy,
            discrepancy_percent: discrepancyPercent,
            status: status,
            settlements_count: settlements.length,
            payments_count: payments.length,
        },
    });

    // Generate alerts if discrepancy detected
    const alerts: Array<{
        alert_type: ReconciliationAlertType;
        severity: AlertSeverity;
        message: string;
        details: Prisma.InputJsonValue;
    }> = [];

    if (discrepancyPercent > DISCREPANCY_THRESHOLD_PERCENT) {
        let severity: AlertSeverity = "low";
        if (discrepancyPercent > 5) severity = "medium";
        if (discrepancyPercent > 10) severity = "high";
        if (discrepancyPercent > 20) severity = "critical";

        alerts.push({
            alert_type: "threshold_exceeded",
            severity,
            message: `Discrepancy of ${discrepancyPercent.toFixed(2)}% detected (${discrepancy.toFixed(2)} USDC). Threshold is ${DISCREPANCY_THRESHOLD_PERCENT}%.`,
            details: {
                expected: expectedBalance,
                actual: finalActualBalance,
                discrepancy,
                discrepancyPercent,
                threshold: DISCREPANCY_THRESHOLD_PERCENT,
            },
        });
    }

    // Check for amount mismatches per settlement
    const failedSettlements = settlements.filter(
        (s: typeof settlements[number]) => s.status === "failed"
    );
    if (failedSettlements.length > 0) {
        alerts.push({
            alert_type: "missing_settlement",
            severity: failedSettlements.length > 3 ? "high" : "medium",
            message: `${failedSettlements.length} failed settlement(s) detected in period.`,
            details: {
                failedSettlementIds: failedSettlements.map((s: typeof failedSettlements[number]) => s.id),
                totalFailedAmount: failedSettlements.reduce(
                    (sum: number, s: typeof failedSettlements[number]) => sum + Number(s.amount),
                    0
                ),
            },
        });
    }

    // Check fee discrepancies (expected fee rate ~2%)
    const expectedFeeRate = 0.02;
    if (totalFiatPayouts > 0) {
        const actualFeeRate = totalFees / (totalFiatPayouts + totalFees);
        const feeDeviation = Math.abs(actualFeeRate - expectedFeeRate);
        if (feeDeviation > 0.005) {
            alerts.push({
                alert_type: "fee_discrepancy",
                severity: feeDeviation > 0.02 ? "high" : "medium",
                message: `Fee rate deviation detected: ${(actualFeeRate * 100).toFixed(2)}% vs expected ${(expectedFeeRate * 100).toFixed(2)}%.`,
                details: {
                    actualFeeRate: actualFeeRate * 100,
                    expectedFeeRate: expectedFeeRate * 100,
                    deviation: feeDeviation * 100,
                    totalFees,
                    totalPayouts: totalFiatPayouts,
                },
            });
        }
    }

    // Create alert records
    if (alerts.length > 0) {
        for (const alert of alerts) {
            await prisma.reconciliationAlert.create({
                data: {
                    reconciliationId: record.id,
                    alert_type: alert.alert_type,
                    severity: alert.severity,
                    message: alert.message,
                    details: alert.details ?? undefined,
                },
            });
        }
    }

    // Fetch the record with alerts
    const fullRecord = await prisma.reconciliationRecord.findUnique({
        where: { id: record.id },
        include: { alerts: true },
    });

    return fullRecord;
};

/**
 * List all reconciliation records with pagination and filters
 */
export const listReconciliationsService = async (
    params: ListReconciliationParams
) => {
    const { page, limit, status, dateFrom, dateTo } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (status && status !== "all") {
        where.status = status;
    }

    if (dateFrom || dateTo) {
        const dateFilter: Record<string, Date> = {};
        if (dateFrom) dateFilter.gte = new Date(dateFrom);
        if (dateTo) dateFilter.lte = new Date(dateTo);
        where.created_at = dateFilter;
    }

    const [records, total] = await Promise.all([
        prisma.reconciliationRecord.findMany({
            where,
            include: {
                alerts: true,
            },
            skip,
            take: limit,
            orderBy: { created_at: "desc" },
        }),
        prisma.reconciliationRecord.count({ where }),
    ]);

    return {
        records,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        },
    };
};

/**
 * Get a specific reconciliation record with full details
 */
export const getReconciliationDetailsService = async (
    reconciliationId: string
) => {
    const record = await prisma.reconciliationRecord.findUnique({
        where: { id: reconciliationId },
        include: {
            alerts: true,
        },
    });

    if (!record) {
        throw { status: 404, message: "Reconciliation record not found" };
    }

    // Also fetch the settlements for this period
    const settlements = await prisma.settlement.findMany({
        where: {
            created_at: {
                gte: record.period_start,
                lte: record.period_end,
            },
        },
        include: { merchant: true },
        orderBy: { created_at: "desc" },
    });

    return {
        ...record,
        settlements,
    };
};

/**
 * List all reconciliation alerts with pagination
 */
export const listReconciliationAlertsService = async (params: {
    page: number;
    limit: number;
    severity?: string;
    acknowledged?: boolean;
}) => {
    const { page, limit, severity, acknowledged } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (severity && severity !== "all") {
        where.severity = severity;
    }

    if (acknowledged !== undefined) {
        where.acknowledged = acknowledged;
    }

    const [alerts, total] = await Promise.all([
        prisma.reconciliationAlert.findMany({
            where,
            include: { reconciliation: true },
            skip,
            take: limit,
            orderBy: { created_at: "desc" },
        }),
        prisma.reconciliationAlert.count({ where }),
    ]);

    return {
        alerts,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        },
    };
};

/**
 * Acknowledge an alert
 */
export const acknowledgeAlertService = async (
    alertId: string,
    userId: string
) => {
    const alert = await prisma.reconciliationAlert.findUnique({
        where: { id: alertId },
    });

    if (!alert) {
        throw { status: 404, message: "Alert not found" };
    }

    return prisma.reconciliationAlert.update({
        where: { id: alertId },
        data: {
            acknowledged: true,
            acknowledged_by: userId,
            acknowledged_at: new Date(),
        },
    });
};

/**
 * Mark a reconciliation record as reviewed
 */
export const reviewReconciliationService = async (
    reconciliationId: string,
    userId: string,
    notes?: string
) => {
    const record = await prisma.reconciliationRecord.findUnique({
        where: { id: reconciliationId },
    });

    if (!record) {
        throw { status: 404, message: "Reconciliation record not found" };
    }

    return prisma.reconciliationRecord.update({
        where: { id: reconciliationId },
        data: {
            status: "reviewed",
            reviewed_by: userId,
            reviewed_at: new Date(),
            notes: notes,
        },
        include: { alerts: true },
    });
};

/**
 * Get reconciliation summary dashboard data
 */
export const getReconciliationSummaryService = async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalRecords, pendingRecords, discrepancyRecords, unresolvedAlerts, recentRecords] =
        await Promise.all([
            prisma.reconciliationRecord.count(),
            prisma.reconciliationRecord.count({
                where: { status: "pending" },
            }),
            prisma.reconciliationRecord.count({
                where: { status: "discrepancy" },
            }),
            prisma.reconciliationAlert.count({
                where: { acknowledged: false },
            }),
            prisma.reconciliationRecord.findMany({
                where: { created_at: { gte: thirtyDaysAgo } },
                include: { alerts: true },
                orderBy: { created_at: "desc" },
                take: 10,
            }),
        ]);

    const averageDiscrepancy =
        recentRecords.length > 0
            ? recentRecords.reduce(
                (sum: number, r: typeof recentRecords[number]) => sum + r.discrepancy_percent,
                0
            ) / recentRecords.length
            : 0;

    return {
        total_records: totalRecords,
        pending_reviews: pendingRecords,
        active_discrepancies: discrepancyRecords,
        unresolved_alerts: unresolvedAlerts,
        average_discrepancy_percent: averageDiscrepancy,
        recent_records: recentRecords,
    };
};
