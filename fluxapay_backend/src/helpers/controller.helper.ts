import { Request, Response } from "express";

export type ControllerHandler<T> = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: Request<Record<string, any>, Record<string, any>, T>,
  res: Response,
) => Promise<Response | void>;

// create controller functions
export function createController<T>(
  serviceFn: (data: T, req: Request) => Promise<any>,
  successStatus = 200, // optional default status
): ControllerHandler<T> {
  return async (req, res) => {
    try {
      const result = await serviceFn(req.body, req);
      res.status(successStatus).json(result);
    } catch (err: any) {
      console.error(err);
      res
        .status(err.status || 500)
        .json({ message: err.message || "Server error" });
    }
  };
}
