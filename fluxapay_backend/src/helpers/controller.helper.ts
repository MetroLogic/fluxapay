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
      const bodyData =
        typeof req.body === "object" && req.body !== null ? { ...req.body } : {};
      const bodyParams =
        typeof bodyData.params === "object" && bodyData.params !== null
          ? { ...bodyData.params }
          : {};
      const bodyQuery =
        typeof bodyData.query === "object" && bodyData.query !== null
          ? { ...bodyData.query }
          : {};

      const requestData = {
        ...bodyData,
        body: bodyData,
        params: {
          ...bodyParams,
          ...(req.params ?? {}),
        },
        query: {
          ...bodyQuery,
          ...(req.query ?? {}),
        },
      } as T & {
        body: typeof bodyData;
        params: Record<string, unknown>;
        query: Record<string, unknown>;
      };

      const result = await serviceFn(requestData, req);
      res.status(successStatus).json(result);
    } catch (err) {
      console.error(err);
      sendApiError(res, err);
    }
  };
}
