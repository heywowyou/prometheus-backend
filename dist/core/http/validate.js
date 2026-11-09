"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplied = exports.asEnum = exports.asDate = exports.asBoolean = exports.asNumber = exports.asRequiredString = exports.asString = void 0;
const AppError_1 = require("../errors/AppError");
/**
 * Small hand-rolled parsers for request bodies.
 *
 * Each helper returns `undefined` when the field is absent, so callers can
 * distinguish "not supplied" (leave unchanged) from "supplied as empty"
 * (clear the field) when building partial updates.
 */
const asString = (value, field, opts = {}) => {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "string") {
        throw new AppError_1.BadRequestError(`${field} must be a string`);
    }
    const result = opts.trim === false ? value : value.trim();
    if (opts.maxLength !== undefined && result.length > opts.maxLength) {
        throw new AppError_1.BadRequestError(`${field} must be at most ${opts.maxLength} characters`);
    }
    return result;
};
exports.asString = asString;
const asRequiredString = (value, field, opts = {}) => {
    const result = (0, exports.asString)(value, field, opts);
    if (!result)
        throw new AppError_1.BadRequestError(`${field} is required`);
    return result;
};
exports.asRequiredString = asRequiredString;
const asNumber = (value, field, opts = {}) => {
    if (value === undefined || value === null || value === "")
        return undefined;
    const result = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(result)) {
        throw new AppError_1.BadRequestError(`${field} must be a number`);
    }
    if (opts.integer && !Number.isInteger(result)) {
        throw new AppError_1.BadRequestError(`${field} must be a whole number`);
    }
    if (opts.min !== undefined && result < opts.min) {
        throw new AppError_1.BadRequestError(`${field} must be at least ${opts.min}`);
    }
    if (opts.max !== undefined && result > opts.max) {
        throw new AppError_1.BadRequestError(`${field} must be at most ${opts.max}`);
    }
    return result;
};
exports.asNumber = asNumber;
const asBoolean = (value, field) => {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value === "boolean")
        return value;
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    throw new AppError_1.BadRequestError(`${field} must be a boolean`);
};
exports.asBoolean = asBoolean;
const asDate = (value, field) => {
    if (value === undefined || value === null || value === "")
        return undefined;
    if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) {
        throw new AppError_1.BadRequestError(`${field} must be a date`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new AppError_1.BadRequestError(`${field} must be a valid date`);
    }
    return date;
};
exports.asDate = asDate;
const asEnum = (value, field, allowed) => {
    if (value === undefined || value === null || value === "")
        return undefined;
    if (typeof value !== "string" || !allowed.includes(value)) {
        throw new AppError_1.BadRequestError(`${field} must be one of: ${allowed.join(", ")}`);
    }
    return value;
};
exports.asEnum = asEnum;
/** True when the client explicitly sent the key, even as `null`. */
const supplied = (body, key) => typeof body === "object" &&
    body !== null &&
    Object.prototype.hasOwnProperty.call(body, key);
exports.supplied = supplied;
//# sourceMappingURL=validate.js.map