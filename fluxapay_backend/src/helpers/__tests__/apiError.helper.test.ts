import { sendApiError, apiError } from "../../helpers/apiError.helper";
import { ErrorCode } from "../../types/errors";

describe("controller.helper / sendApiError", () => {
  it("includes code field in error responses", () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };

    sendApiError(
      res,
      apiError(404, ErrorCode.INVOICE_NOT_FOUND, "Invoice not found"),
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: "INVOICE_NOT_FOUND",
      message: "Invoice not found",
    });
  });

  it("defaults to INTERNAL_ERROR when code is missing", () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };

    sendApiError(res, { status: 500, message: "Server error" });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "INTERNAL_ERROR",
        message: "Server error",
      }),
    );
  });

  it("sets Retry-After header for rate limit errors", () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };

    sendApiError(
      res,
      apiError(429, ErrorCode.RATE_LIMIT_EXCEEDED, "Too many requests", {
        retryAfterSeconds: 30,
      }),
    );

    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "30");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "RATE_LIMIT_EXCEEDED",
        retry_after_seconds: 30,
      }),
    );
  });
});
