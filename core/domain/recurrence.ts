export const RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly"] as const;

export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

export const isRecurrenceType = (value: unknown): value is RecurrenceType =>
  typeof value === "string" &&
  (RECURRENCE_TYPES as readonly string[]).includes(value);

/**
 * When a recurring item last completed at `lastCompletedAt` becomes due again.
 *
 * Returns the epoch for items that have never been completed, so callers can
 * compare `now >= getNextResetTime(...)` without special-casing null.
 */
export const getNextResetTime = (
  lastCompletedAt: string | Date | null | undefined,
  type: RecurrenceType,
): Date => {
  if (!lastCompletedAt) return new Date(0);

  const date = new Date(lastCompletedAt);
  if (Number.isNaN(date.getTime())) return new Date(0);

  switch (type) {
    case "daily":
      date.setDate(date.getDate() + 1);
      break;
    case "weekly": {
      // Recurring weekly items reset on the following Monday.
      const dayOfWeek = date.getDay();
      const daysUntilNextMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
      date.setDate(date.getDate() + daysUntilNextMonday);
      break;
    }
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      date.setDate(1);
      break;
    case "none":
      break;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};
