/**
 * Repeat rules for tasks (habits keep their daily / weekly / monthly cycles).
 * All arithmetic is on calendar days (`YYYY-MM-DD`), so no time zone can
 * shift an occurrence.
 */

export const REPEAT_UNITS = ["day", "week", "month", "year"] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

export const REPEAT_MODES = ["fixed", "afterCompletion"] as const;
export type RepeatMode = (typeof REPEAT_MODES)[number];

export interface RepeatRule {
  /** Every N units, 1 to 365. */
  every: number;
  unit: RepeatUnit;
  /** Weekly rules only: 0 = Sunday … 6 = Saturday. Empty means "same weekday". */
  weekdays: number[];
  /** `fixed`: on schedule from the planned day; `afterCompletion`: counted from the day it's done. */
  mode: RepeatMode;
  /**
   * Monthly rules only: the day of the month it falls on (1-31, clamped to
   * short months), or -1 for the last day. Absent or null: the planned day's.
   */
  monthDay?: number | null;
}

/** `monthDay` of the month `months` after `day`'s month (-1 = last day; clamped). */
const dayInMonth = (day: string, months: number, monthDay: number): string => {
  const date = toUtc(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(monthDay === -1 ? lastDay : Math.min(monthDay, lastDay));
  return toKey(target);
};

export const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const DAY_MS = 86_400_000;

const toUtc = (day: string): Date => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
};

const toKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;

export const addDays = (day: string, days: number): string =>
  toKey(new Date(toUtc(day).getTime() + days * DAY_MS));

/** Whole days from `a` to `b`. */
export const daysBetween = (a: string, b: string): number =>
  Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);

/** Same day of month `months` later, clamped to the month's length (31 Jan + 1 → 28/29 Feb). */
const addMonths = (day: string, months: number): string => {
  const date = toUtc(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return toKey(target);
};

/** Monday-based week number, for "every N weeks". */
const weekIndex = (day: string): number => Math.floor((toUtc(day).getTime() / DAY_MS + 3) / 7);

/** The first occurrence strictly after `from`. */
export const nextOccurrence = (from: string, rule: RepeatRule): string => {
  const every = Math.max(1, Math.floor(rule.every));
  switch (rule.unit) {
    case "day":
      return addDays(from, every);
    case "week": {
      const weekdays = rule.weekdays.filter((day) => day >= 0 && day <= 6);
      if (weekdays.length === 0) return addDays(from, 7 * every);
      const startWeek = weekIndex(from);
      for (let offset = 1; offset <= 7 * every + 7; offset += 1) {
        const candidate = addDays(from, offset);
        const weeks = weekIndex(candidate) - startWeek;
        if (!weekdays.includes(toUtc(candidate).getUTCDay())) continue;
        if (weeks === 0 || weeks % every === 0) return candidate;
      }
      return addDays(from, 7 * every);
    }
    case "month": {
      if (rule.monthDay) {
        // Off-schedule days (a task just switched to "on the 1st") snap to the next one.
        const sameMonth = dayInMonth(from, 0, rule.monthDay);
        return sameMonth > from ? sameMonth : dayInMonth(from, every, rule.monthDay);
      }
      return addMonths(from, every);
    }
    case "year":
      return addMonths(from, 12 * every);
  }
};

/**
 * For monthly rules pinned to a day of the month: the first occurrence on or
 * after `day` (`day` itself when it's on the schedule). Other rules: `day`.
 */
export const alignToRule = (day: string, rule: RepeatRule): string => {
  if (rule.unit !== "month" || !rule.monthDay) return day;
  const previous = addDays(day, -1);
  return nextOccurrence(previous, rule) === day ? day : nextOccurrence(day, rule);
};

/**
 * The day a repeating task moves to once it's done today. Fixed schedules
 * skip occurrences already in the past, so a task left undone for a while
 * comes back once rather than once per missed day.
 */
export const advanceRepeat = (rule: RepeatRule, plannedDay: string | null, today: string): string => {
  const base = rule.mode === "afterCompletion" || !plannedDay ? today : plannedDay;
  let next = nextOccurrence(base, rule);
  let guard = 0;
  while (next <= today && guard < 1000) {
    next = nextOccurrence(next, rule);
    guard += 1;
  }
  return next;
};
