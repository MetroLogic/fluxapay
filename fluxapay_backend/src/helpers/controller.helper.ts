import { Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ControllerHandler<T = Record<string, any>> = (
  req: Request,
  res: Response,
) => Promise<Response | void>;

// create controller functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createController<T = Record<string, any>>(
  serviceFn: (data: T, req: Request) => Promise<unknown>,
  successStatus = 200 // optional default status
): ControllerHandler<T> {
  return async (req: Request, res: Response) => {
    try {
      const requestData = {
        ...(typeof req.body === "object" && req.body !== null ? req.body : {}),
        params: req.params,
        query: req.query,
      } as T;

      const result = await serviceFn(requestData, req);
      res.status(successStatus).json(result);
    } catch (err) {
      console.error(err);
      const status = (err as any).status || 500;
      const message = (err as any).message || "Server error";

      // Set Retry-After header for rate-limit errors that carry retryAfterSeconds
      if (status === 429 && (err as any).retryAfterSeconds) {
        res.setHeader("Retry-After", String((err as any).retryAfterSeconds));
      }

      res.status(status).json({
        message,
        ...(status === 429 && (err as any).retryAfterSeconds
          ? { retry_after_seconds: (err as any).retryAfterSeconds }
          : {}),
      });
    }
  };
}
