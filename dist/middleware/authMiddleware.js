"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
/**
 * This middleware checks if the request has a valid Clerk session.
 * On success it attaches `req.auth` (including `userId`) and calls `next()`.
 * On failure it responds with 401 Unauthorized.
 */
const requireAuth = (0, clerk_sdk_node_1.ClerkExpressRequireAuth)({});
exports.default = requireAuth;
