import type { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an async handler so a rejected promise reaches the error middleware.
 *
 * Express 5 forwards rejections automatically, but wrapping keeps the
 * behaviour explicit and lets handlers stay free of try/catch noise.
 */
export const asyncHandler =
  (handler: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };

export default asyncHandler;
