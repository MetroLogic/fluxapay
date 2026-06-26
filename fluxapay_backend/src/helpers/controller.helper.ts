import { Request, Response } from "express";
import { sendApiError } from "./apiError.helper";

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
      sendApiError(res, err);
    }
  };
}
