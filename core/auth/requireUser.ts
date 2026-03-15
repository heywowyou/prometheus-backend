import type { RequestHandler } from "express";
import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";

const requireUser: RequestHandler = ClerkExpressRequireAuth({});

export default requireUser;

