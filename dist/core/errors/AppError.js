"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnprocessableEntityError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.BadRequestError = exports.AppError = void 0;
/**
 * Base class for errors that carry an intended HTTP status.
 *
 * Services throw these; the error-handling middleware turns them into
 * responses. Anything that is *not* an AppError is treated as an unexpected
 * failure and reported as a 500 without leaking its message.
 */
class AppError extends Error {
    status;
    /** Machine-readable code, surfaced to clients for programmatic handling. */
    code;
    /** Optional field-level detail, e.g. `{ rating: "must be between 1 and 10" }`. */
    details;
    constructor(status, code, message, details) {
        super(message);
        this.name = new.target.name;
        this.status = status;
        this.code = code;
        this.details = details;
        Error.captureStackTrace?.(this, new.target);
    }
}
exports.AppError = AppError;
class BadRequestError extends AppError {
    constructor(message, details) {
        super(400, "BAD_REQUEST", message, details);
    }
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(401, "UNAUTHORIZED", message);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = "Not authorized") {
        super(403, "FORBIDDEN", message);
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError {
    constructor(resource) {
        super(404, "NOT_FOUND", `${resource} not found`);
    }
}
exports.NotFoundError = NotFoundError;
class UnprocessableEntityError extends AppError {
    constructor(message) {
        super(422, "UNPROCESSABLE_ENTITY", message);
    }
}
exports.UnprocessableEntityError = UnprocessableEntityError;
//# sourceMappingURL=AppError.js.map