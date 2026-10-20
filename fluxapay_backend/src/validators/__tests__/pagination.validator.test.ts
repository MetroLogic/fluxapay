import { Request, Response, NextFunction } from "express";
import { validatePagination } from "../pagination.validator";

describe("validatePagination middleware", () => {
  let req: Partial<Request>;
  let res: any;
  let next: NextFunction;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it("passes when no pagination params are provided", () => {
    req.query = {};
    validatePagination(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes for valid positive integer page and limit", () => {
    req.query = { page: "2", limit: "25" };
    validatePagination(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("passes for valid cursor string", () => {
    req.query = { cursor: "eyJpZCI6InBheV8xIn0", limit: "50" };
    validatePagination(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects non-integer limit with 400", () => {
    req.query = { limit: "abc" };
    validatePagination(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("`limit` must be a positive integer"),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects non-positive limit with 400", () => {
    req.query = { limit: "-5" };
    validatePagination(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();

    jest.clearAllMocks();
    req.query = { limit: "0" };
    validatePagination(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects empty cursor with 400", () => {
    req.query = { cursor: "   " };
    validatePagination(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("`cursor` must be a non-empty string"),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
