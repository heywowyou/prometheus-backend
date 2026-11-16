import { localDateKey, localTimeKey, zonedInstant } from "../../core/domain";
import { addDays, daysBetween, nextOccurrence, type RepeatRule } from "../todos/repeat";
import type { EventRepeat } from "./calendar-event.model";

/** The parts of an event that decide when it happens. */
export interface EventTiming {
  allDay: boolean;
  startDay?: string | null;
  endDay?: string | null;
  start?: Date | null;
  end?: Date | null;
  timeZone: string;
  repeat?: EventRepeat | null;
  exdates?: string[];
}

export interface Occurrence {
  /** The day this occurrence starts on (its id within a repeating event). */
  day: string;
  start: Date;
  end: Date;
  /** All-day only: last day, inclusive. */
  endDay?: string;
}

/** Hard stop for walking a repeat rule, so a bad rule can't spin. */
const MAX_STEPS = 5000;

const toRule = (repeat: EventRepeat): RepeatRule => ({
  every: repeat.every,
  unit: repeat.unit,
  weekdays: repeat.weekdays ?? [],
  mode: "fixed",
});

/** The occurrence starting on `day`, keeping the event's wall-clock time and length. */
const occurrenceOn = (event: EventTiming, day: string): Occurrence => {
  if (event.allDay) {
    const length = event.startDay && event.endDay ? Math.max(0, daysBetween(event.startDay, event.endDay)) : 0;
    const endDay = addDays(day, length);
    return {
      day,
      endDay,
      start: zonedInstant(day, "00:00", event.timeZone),
      end: zonedInstant(addDays(endDay, 1), "00:00", event.timeZone),
    };
  }
  const start = event.start as Date;
  const duration = Math.max(0, (event.end as Date).getTime() - start.getTime());
  const begins = zonedInstant(day, localTimeKey(start, event.timeZone), event.timeZone);
  return { day, start: begins, end: new Date(begins.getTime() + duration) };
};

/** The day the first occurrence starts on. */
export const firstDay = (event: EventTiming): string =>
  event.allDay ? (event.startDay as string) : localDateKey(event.start as Date, event.timeZone);

/**
 * Every occurrence overlapping [from, to), in start order. Repeats walk the
 * rule day by day in the event's own zone, so a weekly 9:00 stays at 9:00
 * across daylight-saving changes.
 */
export const expandOccurrences = (event: EventTiming, from: Date, to: Date): Occurrence[] => {
  const overlaps = (occurrence: Occurrence) => occurrence.start < to && occurrence.end > from;
  const base = firstDay(event);
  if (!event.repeat) {
    const single = occurrenceOn(event, base);
    return overlaps(single) ? [single] : [];
  }

  const rule = toRule(event.repeat);
  const excluded = new Set(event.exdates ?? []);
  const until = event.repeat.until ?? null;
  const out: Occurrence[] = [];
  let day = base;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (until && day > until) break;
    const occurrence = occurrenceOn(event, day);
    if (occurrence.start >= to) break;
    if (!excluded.has(day) && overlaps(occurrence)) out.push(occurrence);
    day = nextOccurrence(day, rule);
  }
  return out;
};

/** All-day reminders count from 9:00 on the day. */
const ALL_DAY_REMINDER_TIME = "09:00";

/** The next reminder instant strictly after `after`, or null when none is left. */
export const nextReminder = (
  event: EventTiming & { remindMinutes?: number | null },
  after: Date,
): Date | null => {
  if (event.remindMinutes === null || event.remindMinutes === undefined) return null;
  const lead = event.remindMinutes * 60_000;
  const horizon = new Date(after.getTime() + 400 * 86_400_000);
  // Occurrences starting from a little before `after` (the lead time).
  for (const occurrence of expandOccurrences(event, new Date(after.getTime() - 86_400_000), horizon)) {
    const startsAt = event.allDay
      ? zonedInstant(occurrence.day, ALL_DAY_REMINDER_TIME, event.timeZone)
      : occurrence.start;
    const at = new Date(startsAt.getTime() - lead);
    if (at > after) return at;
  }
  return null;
};
