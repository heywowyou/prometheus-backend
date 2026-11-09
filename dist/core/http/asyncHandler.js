"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
/**
 * Wraps an async handler so a rejected promise reaches the error middleware.
 *
 * Express 5 forwards rejections automatically, but wrapping keeps the
 * behaviour explicit and lets handlers stay free of try/catch noise.
 */
const asyncHandler = (handler) => (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
};
exports.asyncHandler = asyncHandler;
exports.default = exports.asyncHandler;
//# sourceMappingURL=asyncHandler.js.map