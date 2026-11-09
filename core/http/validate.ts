import { BadRequestError } from "../errors/AppError";

/**
 * Small hand-rolled parsers for request bodies.
 *
 * Each helper returns `undefined` when the field is absent, so callers can
 * distinguish "not supplied" (leave unchanged) from "supplied as empty"
 * (clear the field) when building partial updates.
 */

export const asString = (
  value: unknown,
  field: string,
  opts: { maxLength?: number; trim?: boolean } = {},
): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new BadRequestError(`${field} must be a string`);
  }
  const result = opts.trim === false ? value : value.trim();
  if (opts.maxLength !== undefined && result.length > opts.maxLength) {
    throw new BadRequestError(
      `${field} must be at most ${opts.maxLength} characters`,
    );
  }
  return result;
};

export const asRequiredString = (
  value: unknown,
  field: string,
  opts: { maxLength?: number } = {},
): string => {
  const result = asString(value, field, opts);
  if (!result) throw new BadRequestError(`${field} is required`);
  return result;
};

export const asNumber = (
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; integer?: boolean } = {},
): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) {
    throw new BadRequestError(`${field} must be a number`);
  }
  if (opts.integer && !Number.isInteger(result)) {
    throw new BadRequestError(`${field} must be a whole number`);
  }
  if (opts.min !== undefined && result < opts.min) {
    throw new BadRequestError(`${field} must be at least ${opts.min}`);
  }
  if (opts.max !== undefined && result > opts.max) {
    throw new BadRequestError(`${field} must be at most ${opts.max}`);
  }
  return result;
};

export const asBoolean = (
  value: unknown,
  field: string,
): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new BadRequestError(`${field} must be a boolean`);
};

export const asDate = (value: unknown, field: string): Date | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) {
    throw new BadRequestError(`${field} must be a date`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(`${field} must be a valid date`);
  }
  return date;
};

export const asEnum = <T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new BadRequestError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
};

/** True when the client explicitly sent the key, even as `null`. */
export const supplied = (body: unknown, key: string): boolean =>
  typeof body === "object" &&
  body !== null &&
  Object.prototype.hasOwnProperty.call(body, key);
