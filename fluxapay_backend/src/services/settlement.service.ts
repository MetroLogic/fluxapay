import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

interface ListSettlementsParams {
    merchantId: string;
    page: number;
    limit: number;
    status?: string;
    currency?: string;
    date_from?: string;
    date_to?: string;
}

export const listSettlementsService = async (params: ListSettlementsParams) => {
    const { merchantId, page, limit, status, currency, date_from, date_to } = params;
    const skip = (page - 1) * limit;

    const where: any = {
        merchantId,
    };

    if (status) {
        where.status = status;
    }

    if (currency) {
        where.currency = currency;
    }

    if (date_from || date_to) {
        where.created_at = {};
        if (date_from) where.created_at.gte = new Date(date_from);
        if (date_to) where.created_at.lte = new Date(date_to);
    }

    const [settlements, total] = await Promise.all([
        prisma.settlement.findMany({
            where,
            skip,
            take: limit,
            orderBy: { created_at: "desc" },
        }),
        prisma.settlement.count({ where }),
    ]);

    return {
        settlements,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        },
    };
};

export const getSettlementDetailsService = async (
    merchantId: string,
    settlementId: string
) => {
    const settlement = await prisma.settlement.findUnique({
        where: { id: settlementId, merchantId },
    });

    if (!settlement) {
        throw new Error("Settlement not found");
    }

    return settlement;
};

export const getSettlementSummaryService = async (merchantId: string) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const settledThisMonth = await prisma.settlement.aggregate({
        where: {
            merchantId,
            status: "completed",
            processed_date: {
                gte: startOfMonth,
                lte: endOfMonth,
            },
        },
        _sum: {
            amount: true,
            fees: true,
        },
    });

    const completedSettlements = await prisma.settlement.findMany({
        where: {
            merchantId,
            status: "completed",
        },
        select: {
            created_at: true,
            processed_date: true,
        },
        take: 100,
    });

    let totalTimeMs = 0;
    let count = 0;
    for (const s of completedSettlements) {
        if (s.processed_date) {
            totalTimeMs += s.processed_date.getTime() - s.created_at.getTime();
            count++;
        }
    }
    const averageSettlementTimeDays = count > 0 ? Math.round(totalTimeMs / count / (1000 * 60 * 60 * 24)) : 0;

    const nextSettlementDate = new Date();
    nextSettlementDate.setDate(nextSettlementDate.getDate() + (1 + 7 - nextSettlementDate.getDay()) % 7);

    return {
        total_settled_this_month: settledThisMonth._sum.amount || 0,
        total_fees_paid: settledThisMonth._sum.fees || 0,
        average_settlement_time_days: averageSettlementTimeDays,
        next_settlement_date: nextSettlementDate,
    };
};

export const exportSettlementService = async (
    merchantId: string,
    settlementId: string,
    format: "pdf" | "csv"
) => {
    const settlement = await prisma.settlement.findUnique({
        where: { id: settlementId, merchantId },
    });

    if (!settlement) {
        throw new Error("Settlement not found");
    }

    if (format === "csv") {
        return {
            filename: `settlement-${settlementId}.csv`,
            content: `ID,Date,Amount,Currency,Status,Fees\n${settlement.id},${settlement.created_at},${settlement.amount},${settlement.currency},${settlement.status},${settlement.fees}`
        };
    }

    return {
        filename: `settlement-${settlementId}.pdf`,
        content: "MOCK_PDF_CONTENT"
    };
};
