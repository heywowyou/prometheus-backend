"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserId = void 0;
const express_1 = require("@clerk/express");
const AppError_1 = require("../errors/AppError");
/**
 * Rejects unauthenticated requests and pins the Clerk user id onto the request
 * so downstream handlers read it without re-deriving it from Clerk.
 */
const requireUser = (req, _res, next) => {
    const { userId } = (0, express_1.getAuth)(req);
    if (!userId) {
        next(new AppError_1.UnauthorizedError());
        return;
    }
    req.userId = userId;
    next();
};
/**
 * Reads the authenticated user id. Throws if called on a route that is not
 * behind `requireUser` — a programming error, not a client error.
 */
const getUserId = (req) => {
    const { userId } = req;
    if (!userId) {
        throw new Error("getUserId called on a route that is not protected by requireUser");
    }
    return userId;
};
exports.getUserId = getUserId;
exports.default = requireUser;
//# sourceMappingURL=requireUser.js.map