import { PrismaClient, PaymentStatus } from "../generated/client/client";
import { SorobanService } from "./SorobanService";
import { eventBus, AppEvents } from "./EventService";

const prisma = new PrismaClient();
const sorobanService = new SorobanService();

export class PaymentService {
    /**
     * Verifies a payment on-chain, updates the database, and emits an internal event.
     */
    public async verifyPayment(
        paymentId: string,
        transactionHash: string,
        payerAddress: string,
        amountReceived: number
    ): Promise<any> {
        // 1. Verify on Soroban
        const onChainVerified = await sorobanService.verifyPaymentOnChain(
            paymentId,
            transactionHash,
            payerAddress,
            amountReceived
        );

        if (!onChainVerified) {
            throw new Error('Payment verification failed on-chain');
        }

        // 2. Update local PostgreSQL database
        const payment = await prisma.payment.update({
            where: { id: paymentId },
            data: {
                status: 'confirmed' as PaymentStatus,
                transaction_hash: transactionHash,
                payer_address: payerAddress,
                confirmed_at: new Date(),
            }
        });

        // 3. Emit internal event for Webhook Service to pick up
        eventBus.emit(AppEvents.PAYMENT_CONFIRMED, payment);

        return payment;
    }
}
