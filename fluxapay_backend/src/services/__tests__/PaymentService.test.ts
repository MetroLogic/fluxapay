import { PaymentService } from "../PaymentService";
import { SorobanService } from "../SorobanService";
import { PrismaClient } from "../../generated/client/client";
import { eventBus, AppEvents } from "../EventService";

// Mock dependencies
jest.mock("../SorobanService");
jest.mock("../../generated/client/client", () => {
    const mPrisma = {
        payment: {
            update: jest.fn(),
        },
        merchant: {
            findUnique: jest.fn(),
        },
    };
    return { PrismaClient: jest.fn(() => mPrisma) };
});
jest.mock("../EventService", () => ({
    eventBus: {
        emit: jest.fn(),
    },
    AppEvents: {
        PAYMENT_CONFIRMED: "payment.confirmed",
    },
}));

describe("PaymentService", () => {
    let paymentService: PaymentService;
    let mockSorobanService: jest.Mocked<SorobanService>;
    let mockPrisma: any;

    beforeEach(() => {
        jest.clearAllMocks();
        paymentService = new PaymentService();
        mockSorobanService = (SorobanService as any).mock.instances[0];
        mockPrisma = new PrismaClient();
    });

    it("should verify payment successfully, update DB and emit event", async () => {
        const paymentId = "pay_123";
        const txHash = "hash_456";
        const payerAddr = "addr_789";
        const amount = 50;

        mockSorobanService.verifyPaymentOnChain.mockResolvedValue(true);
        const mockPayment = {
            payment_id: paymentId,
            merchant_id: "merch_1",
            amount: 50,
            currency: "USDC",
            status: "confirmed",
            confirmed_at: new Date(),
        };
        mockPrisma.payment.update.mockResolvedValue(mockPayment);

        const result = await paymentService.verifyPayment(paymentId, txHash, payerAddr, amount);

        expect(mockSorobanService.verifyPaymentOnChain).toHaveBeenCalledWith(
            paymentId, txHash, payerAddr, amount
        );
        expect(mockPrisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { payment_id: paymentId },
            data: expect.objectContaining({ status: "confirmed" }),
        }));
        expect(eventBus.emit).toHaveBeenCalledWith(AppEvents.PAYMENT_CONFIRMED, mockPayment);
        expect(result.status).toBe("confirmed");
    });

    it("should throw error if on-chain verification fails", async () => {
        mockSorobanService.verifyPaymentOnChain.mockResolvedValue(false);

        await expect(paymentService.verifyPayment("pay_1", "tx_1", "addr_1", 10))
            .rejects.toThrow("Payment verification failed on-chain");

        expect(mockPrisma.payment.update).not.toHaveBeenCalled();
        expect(eventBus.emit).not.toHaveBeenCalled();
    });
});
