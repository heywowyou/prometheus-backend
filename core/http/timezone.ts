import type { Request } from "express";
import config from "../config";
import { isValidTimeZone } from "../domain";

/** Header the frontend sets to the browser's IANA zone, e.g. `Europe/Paris`. */
export const TIMEZONE_HEADER = "x-timezone";

/**
 * The time zone a request's day/week boundaries should use.
 *
 * Reads the client's zone so "daily" means the user's midnight wherever the
 * server runs; an absent or unknown zone falls back to `APP_TIMEZONE`.
 */
export const getRequestTimeZone = (req: Request): string => {
  const header = req.get(TIMEZONE_HEADER)?.trim();
  return header && header.length <= 64 && isValidTimeZone(header)
    ? header
    : config.timeZone;
};
