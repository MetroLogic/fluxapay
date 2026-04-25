import { PrismaClient } from "../generated/client/client";
import { getLogger } from "../utils/logger";

const prisma = new PrismaClient();
const logger = getLogger();

/**
 * Marks all pending invoices whose due_date has passed as "overdue".
 * Designed to be called by a cron job (e.g. every hour).
 *
 * Returns the number of invoices updated.
 */
export async function runInvoiceOverdueJob(): Promise<{ updated: number }> {
    const now = new Date();

    const result = await prisma.invoice.updateMany({
        where: {
            status: "pending",
            due_date: { lt: now, not: null },
        },
        data: {
            status: "overdue",
        },
    });

    if (result.count > 0) {
        logger.info("Invoice overdue job completed", {
            updated: result.count,
            ran_at: now.toISOString(),
        });
    }

    return { updated: result.count };
}
