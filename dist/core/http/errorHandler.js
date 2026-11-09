"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFoundHandler = void 0;
const multer_1 = require("multer");
const mongoose_1 = __importDefault(require("mongoose"));
const AppError_1 = require("../errors/AppError");
const logger_1 = __importDefault(require("../logger"));
const config_1 = require("../config");
/** Translates known error shapes into a status + client-safe body. */
const describe = (err) => {
    if (err instanceof AppError_1.AppError) {
        return {
            status: err.status,
            body: { message: err.message, code: err.code, details: err.details },
        };
    }
    if (err instanceof multer_1.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE"
            ? "File is larger than the 5 MB limit"
            : `Upload rejected: ${err.message}`;
        return { status: 400, body: { message, code: err.code } };
    }
    // A malformed ObjectId in a path param is a client error, not a server one.
    if (err instanceof mongoose_1.default.Error.CastError) {
        return {
            status: 400,
            body: { message: `Invalid ${err.path}`, code: "INVALID_ID" },
        };
    }
    if (err instanceof mongoose_1.default.Error.ValidationError) {
        const details = Object.fromEntries(Object.entries(err.errors).map(([field, e]) => [field, e.message]));
        return {
            status: 400,
            body: { message: "Validation failed", code: "VALIDATION_FAILED", details },
        };
    }
    return {
        status: 500,
        body: { message: "Internal server error", code: "INTERNAL_ERROR" },
    };
};
const notFoundHandler = (req, _res, next) => {
    next(new AppError_1.NotFoundError(`Route ${req.method} ${req.originalUrl}`));
};
exports.notFoundHandler = notFoundHandler;
const errorHandler = (err, req, res, next) => {
    const { status, body } = describe(err);
    if (status >= 500) {
        logger_1.default.error(`${req.method} ${req.originalUrl} failed`, err);
    }
    else {
        logger_1.default.warn(`${req.method} ${req.originalUrl} → ${status} ${body.code}`);
    }
    // Headers already flushed (e.g. a stream failed mid-response): the only
    // correct move is to destroy the connection rather than append a JSON body.
    if (res.headersSent) {
        next(err);
        return;
    }
    res.status(status).json(config_1.isProduction || status < 500
        ? body
        : { ...body, stack: err instanceof Error ? err.stack : undefined });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errorHandler.js.map