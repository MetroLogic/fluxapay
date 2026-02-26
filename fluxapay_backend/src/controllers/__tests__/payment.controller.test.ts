import { createPayment } from "../payment.controller";
import { PaymentService } from "../../services/payment.service";

jest.mock("../../services/payment.service", () => ({
  PaymentService: {
    getRateLimitWindowSeconds: jest.fn(),
    checkRateLimit: jest.fn(),
    createPayment: jest.fn(),
  },
}));

jest.mock("../../generated/client/client", () => {
  const mockPrismaClient = {
    payment: {
      update: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

describe("createPayment controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 429 and Retry-After header when rate limit is exceeded", async () => {
    (PaymentService.getRateLimitWindowSeconds as jest.Mock).mockReturnValue(60);
    (PaymentService.checkRateLimit as jest.Mock).mockResolvedValue(false);

    const req: any = {
      body: {
        merchantId: "merchant_1",
        amount: 100,
        currency: "USDC",
        customer_email: "test@example.com",
        metadata: {},
      },
    };

    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await createPayment(req, res);

    expect(PaymentService.checkRateLimit).toHaveBeenCalledWith("merchant_1");
    expect(PaymentService.getRateLimitWindowSeconds).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "60");
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Rate limit exceeded. Please try again later.",
    });
    expect(PaymentService.createPayment).not.toHaveBeenCalled();
  });
});
