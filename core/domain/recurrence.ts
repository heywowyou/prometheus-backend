export const RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly"] as const;

export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

export const isRecurrenceType = (value: unknown): value is RecurrenceType =>
  typeof value === "string" &&
  (RECURRENCE_TYPES as readonly string[]).includes(value);

/** True when `timeZone` is an IANA zone this runtime understands. */
export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

interface WallClock {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

/** The wall-clock reading of `date` in `timeZone`. */
const wallClock = (date: Date, timeZone: string): WallClock => {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
  };
};

/** How far `timeZone` is ahead of UTC at `instant` (epoch ms), in ms. */
const offsetAt = (instant: number, timeZone: string): number => {
  const wholeSecond = Math.floor(instant / 1000) * 1000;
  const c = wallClock(new Date(wholeSecond), timeZone);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  return asUtc - wholeSecond;
};

/**
 * The instant at which the clock in `timeZone` reads 00:00 on the given day.
 * Month/day overflow is normalised (day 32 → the 1st of the next month).
 */
const midnightIn = (
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date => instantIn(year, month, day, 0, 0, timeZone);

/** The instant at which the clock in `timeZone` reads `hour:minute` on the given day. */
const instantIn = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date => {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // A second pass settles the offset when the guess lands across a DST change.
  const first = guess - offsetAt(guess, timeZone);
  return new Date(guess - offsetAt(first, timeZone));
};

/** The instant of `day` (`YYYY-MM-DD`) at `time` (`HH:mm`) on the clock of `timeZone`. */
export const zonedInstant = (day: string, time: string, timeZone: string): Date => {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return instantIn(year ?? 1970, month ?? 1, date ?? 1, hour ?? 0, minute ?? 0, timeZone);
};

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 of `date`'s calendar day in `timeZone`. */
const dayIndex = (date: Date, timeZone: string): number => {
  const { year, month, day } = wallClock(date, timeZone);
  return Date.UTC(year, month - 1, day) / DAY_MS;
};

/**
 * A sequential number for the recurrence cycle `date` falls in, in
 * `timeZone`: consecutive days, Monday-based weeks or months differ by 1.
 * Streaks are runs of consecutive cycle numbers.
 */
export const cycleIndex = (
  date: Date,
  type: RecurrenceType,
  timeZone: string,
): number => {
  switch (type) {
    case "weekly":
      // 1970-01-01 was a Thursday; +3 makes every week start on a Monday.
      return Math.floor((dayIndex(date, timeZone) + 3) / 7);
    case "monthly": {
      const { year, month } = wallClock(date, timeZone);
      return year * 12 + (month - 1);
    }
    case "daily":
    case "none":
      return dayIndex(date, timeZone);
  }
};

/** Days since 1970-01-01 of a `YYYY-MM-DD` key. */
const dayIndexOfKey = (key: string): number => {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / DAY_MS;
};

const keyOfDayIndex = (index: number): string => new Date(index * DAY_MS).toISOString().slice(0, 10);

/** The cycle number (as `cycleIndex`) of the day `key` (`YYYY-MM-DD`). */
export const cycleIndexOfKey = (key: string, type: RecurrenceType): number => {
  switch (type) {
    case "weekly":
      return Math.floor((dayIndexOfKey(key) + 3) / 7);
    case "monthly": {
      const [year, month] = key.split("-").map(Number);
      return (year ?? 1970) * 12 + ((month ?? 1) - 1);
    }
    case "daily":
    case "none":
      return dayIndexOfKey(key);
  }
};

/**
 * The first day (`YYYY-MM-DD`) of the cycle `date` falls in: the day itself,
 * that week's Monday, or the 1st of the month. Skips are stored by this key.
 */
export const cycleKey = (date: Date, type: RecurrenceType, timeZone: string): string => {
  switch (type) {
    case "weekly":
      return keyOfDayIndex(cycleIndex(date, "weekly", timeZone) * 7 - 3);
    case "monthly":
      return `${localDateKey(date, timeZone).slice(0, 7)}-01`;
    case "daily":
    case "none":
      return localDateKey(date, timeZone);
  }
};

/** `HH:mm` of `date` on the clock of `timeZone`. */
export const localTimeKey = (date: Date, timeZone: string): string => {
  const { hour, minute } = wallClock(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/** `YYYY-MM-DD` of `date`'s calendar day in `timeZone`. */
export const localDateKey = (date: Date, timeZone: string): string => {
  const { year, month, day } = wallClock(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/**
 * When a recurring item last completed at `lastCompletedAt` becomes due again.
 *
 * Boundaries are midnights in `timeZone` — the user's zone, not the server's
 * (production runs in UTC). Returns the epoch for items that have never been
 * completed, so callers can compare `now >= getNextResetTime(...)` without
 * special-casing null.
 */
export const getNextResetTime = (
  lastCompletedAt: string | Date | null | undefined,
  type: RecurrenceType,
  timeZone: string,
): Date => {
  if (!lastCompletedAt) return new Date(0);

  const date = new Date(lastCompletedAt);
  if (Number.isNaN(date.getTime())) return new Date(0);

  const { year, month, day, weekday } = wallClock(date, timeZone);

  switch (type) {
    case "daily":
      return midnightIn(year, month, day + 1, timeZone);
    case "weekly": {
      // Recurring weekly items reset on the following Monday.
      const daysUntilNextMonday = weekday === 1 ? 7 : (8 - weekday) % 7 || 7;
      return midnightIn(year, month, day + daysUntilNextMonday, timeZone);
    }
    case "monthly":
      return midnightIn(year, month + 1, 1, timeZone);
    case "none":
      return midnightIn(year, month, day, timeZone);
  }
};
