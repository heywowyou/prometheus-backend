import { z } from "zod";
import mongoose from "mongoose";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AppError, BadRequestError } from "../../core/errors/AppError";
import { localDateKey, localTimeKey, zonedInstant } from "../../core/domain";
import logger from "../../core/logger";
import { addDays, DAY_PATTERN, type RepeatRule } from "../todos/repeat";

/** Who an MCP request acts for, and the zone its days and times are in. */
export interface McpContext {
  userId: string;
  timeZone: string;
}

export const todayOf = (ctx: McpContext): string => localDateKey(new Date(), ctx.timeZone);

/** `YYYY-MM-DD`, or today / tomorrow / yesterday in the user's zone. */
export const resolveDay = (value: string, ctx: McpContext, field = "date"): string => {
  const text = value.trim().toLowerCase();
  const today = todayOf(ctx);
  if (text === "today") return today;
  if (text === "tomorrow") return addDays(today, 1);
  if (text === "yesterday") return addDays(today, -1);
  if (DAY_PATTERN.test(text)) return text;
  throw new BadRequestError(`${field} must be YYYY-MM-DD, today, tomorrow or yesterday`);
};

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * An instant from `YYYY-MM-DDTHH:mm` in the user's zone, or from a full ISO
 * timestamp with an offset.
 */
export const resolveInstant = (value: string, ctx: McpContext, field: string): Date => {
  const text = value.trim();
  const local = LOCAL_DATE_TIME.exec(text);
  if (local) return zonedInstant(local[1] as string, `${local[2]}:${local[3]}`, ctx.timeZone);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date;
  }
  throw new BadRequestError(`${field} must be YYYY-MM-DDTHH:mm (local time)`);
};

/** `YYYY-MM-DD HH:mm` in the user's zone. */
export const localStamp = (date: Date | string | null | undefined, ctx: McpContext): string | undefined => {
  if (!date) return undefined;
  const instant = typeof date === "string" ? new Date(date) : date;
  return `${localDateKey(instant, ctx.timeZone)} ${localTimeKey(instant, ctx.timeZone)}`;
};

export const localDay = (date: Date | string | null | undefined, ctx: McpContext): string | undefined => {
  if (!date) return undefined;
  return localDateKey(typeof date === "string" ? new Date(date) : date, ctx.timeZone);
};

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "every 2 weeks on mon, thu", "every month on day 1", "every day (after done)". */
export const describeRepeat = (
  rule: (Partial<RepeatRule> & { unit: string; until?: string | null }) | null | undefined,
): string | undefined => {
  if (!rule) return undefined;
  const every = rule.every ?? 1;
  const unit = every === 1 ? rule.unit : `${every} ${rule.unit}s`;
  let text = `every ${unit}`;
  if (rule.unit === "week" && rule.weekdays?.length) {
    text += ` on ${rule.weekdays.map((day) => WEEKDAYS[day]).join(", ")}`;
  }
  if (rule.unit === "month" && rule.monthDay) {
    text += rule.monthDay === -1 ? " on the last day" : ` on day ${rule.monthDay}`;
  }
  if (rule.mode === "afterCompletion") text += " (counted from when it's done)";
  if (rule.until) text += ` until ${rule.until}`;
  return text;
};

/** Drops undefined, null, false, "" and empty arrays, so results stay short. */
export const compact = <T extends Record<string, unknown>>(object: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(object).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== false &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    ),
  ) as Partial<T>;

/* ---- shared input schemas ---- */

export const idSchema = z.string().regex(/^[a-f0-9]{24}$/i, "must be an id from a previous result");

export const daySchema = z
  .string()
  .describe("YYYY-MM-DD, or today / tomorrow / yesterday");

export const weekdaySchema = z.enum(WEEKDAYS);

export const weekdayIndexes = (days: readonly (typeof WEEKDAYS)[number][] | undefined): number[] =>
  [...new Set((days ?? []).map((day) => WEEKDAYS.indexOf(day)))].sort();

/* ---- results ---- */

const text = (value: string): CallToolResult => ({ content: [{ type: "text", text: value }] });

const failure = (message: string): CallToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

/**
 * Runs a tool body and turns its result into MCP content (JSON, or the text
 * itself), and known errors into a tool error Claude can read and act on.
 */
export const run =
  <A>(body: (args: A) => Promise<unknown>) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      const result = await body(args);
      return text(typeof result === "string" ? result : JSON.stringify(result));
    } catch (error) {
      if (error instanceof AppError) {
        const details = error.details
          ? ` (${Object.entries(error.details).map(([key, value]) => `${key}: ${value}`).join("; ")})`
          : "";
        return failure(`${error.message}${details}`);
      }
      if (error instanceof mongoose.Error.CastError) return failure(`Invalid ${error.path}`);
      if (error instanceof mongoose.Error.ValidationError) {
        return failure(Object.values(error.errors).map((e) => e.message).join("; "));
      }
      logger.error("MCP tool failed", error);
      return failure("Something went wrong on the Prometheus server.");
    }
  };
