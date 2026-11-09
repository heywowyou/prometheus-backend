import type { RequestHandler, Request } from "express";
import { getAuth } from "@clerk/express";
import { UnauthorizedError } from "../errors/AppError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Clerk user id, set by `requireUser`. */
      userId?: string;
    }
  }
}

/**
 * Rejects unauthenticated requests and pins the Clerk user id onto the request
 * so downstream handlers read it without re-deriving it from Clerk.
 */
const requireUser: RequestHandler = (req, _res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    next(new UnauthorizedError());
    return;
  }
  req.userId = userId;
  next();
};

/**
 * Reads the authenticated user id. Throws if called on a route that is not
 * behind `requireUser` — a programming error, not a client error.
 */
export const getUserId = (req: Request): string => {
  const { userId } = req;
  if (!userId) {
    throw new Error(
      "getUserId called on a route that is not protected by requireUser",
    );
  }
  return userId;
};

export default requireUser;
