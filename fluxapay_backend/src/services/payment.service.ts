import { PrismaClient } from "../generated/client/client";
import { HDWalletService } from "./HDWalletService";

const prisma = new PrismaClient();

const MASTER_SEED = process.env.HD_WALLET_MASTER_SEED;
if (!MASTER_SEED) {
    throw new Error('HD_WALLET_MASTER_SEED environment variable is not defined');
}
const walletService = new HDWalletService(MASTER_SEED);


export class PaymentService {
    /**
     * Checks if a merchant is within their rate limit.
     * Stub implementation: returns true.
     */
    static async checkRateLimit(merchantId: string): Promise<boolean> {
        // Implementation for rate limiting (e.g., Redis or DB check) would go here
        return true;
    }

    /**
     * Creates a new payment record and derives a Stellar address.
     */
    static async createPayment(data: {
        merchantId: string;
        amount: number;
        currency: string;
        customer_email: string;
        metadata: any;
        success_url?: string;
        cancel_url?: string;
    }) {
        const { merchantId, amount, currency, customer_email, metadata, success_url, cancel_url } = data;

        // 1. Create the payment record in DB first to get the payment ID
        const payment = await prisma.payment.create({
            data: {
                merchantId,
                amount,
                currency,
                customer_email,
                metadata,
                success_url,
                cancel_url,
                status: "pending",
                timeline: [{ event: "payment_initiated", timestamp: new Date() }]
            }
        });

        return payment;
    }
}
