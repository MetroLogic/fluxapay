import { Request, Response } from "express";

export type ControllerHandler<T> = (
  req: Request,
  res: Response,
) => Promise<Response | void>;

// create controller functions
export function createController<T>(
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
      res
        .status((err as any).status || 500)
        .json({ message: (err as any).message || "Server error" });
    }
  };
}
