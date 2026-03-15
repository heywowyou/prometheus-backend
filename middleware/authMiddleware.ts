import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";
import type { RequestHandler } from "express";

/**
 * This middleware checks if the request has a valid Clerk session.
 * On success it attaches `req.auth` (including `userId`) and calls `next()`.
 * On failure it responds with 401 Unauthorized.
 */
const requireAuth: RequestHandler = ClerkExpressRequireAuth({});

export default requireAuth;

