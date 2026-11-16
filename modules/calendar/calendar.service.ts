import { Types, type HydratedDocument } from "mongoose";
import { localDateKey, localTimeKey, zonedInstant } from "../../core/domain";
import { BadRequestError, NotFoundError } from "../../core/errors/AppError";
import { addDays, daysBetween } from "../todos/repeat";
import CalendarEvent, { type EventColor, type EventRepeat, type ICalendarEvent } from "./calendar-event.model";
import { expandOccurrences, nextReminder, type Occurrence } from "./occurrences";

type EventDoc = HydratedDocument<ICalendarEvent>;

export interface EventInput {
  title?: string;
  notes?: string;
  location?: string;
  color?: EventColor;
  allDay?: boolean;
  startDay?: string;
  endDay?: string;
  start?: Date;
  end?: Date;
  repeat?: EventRepeat | null;
  remindMinutes?: number | null;
}

/** One occurrence as the client draws it. `occurrenceDay` identifies it within a repeating event. */
export interface OccurrenceView {
  _id: string;
  eventId: string;
  occurrenceDay: string;
  title: string;
  notes: string;
  location: string;
  color: EventColor;
  allDay: boolean;
  start: Date;
  end: Date;
  /** All-day: first and last day, inclusive. */
  startDay?: string;
  endDay?: string;
  repeat: EventRepeat | null;
  remindMinutes: number | null;
}

const toView = (event: EventDoc, occurrence: Occurrence): OccurrenceView => ({
  _id: `${String(event._id)}:${occurrence.day}`,
  eventId: String(event._id),
  occurrenceDay: occurrence.day,
  title: event.title,
  notes: event.notes,
  location: event.location,
  color: event.color,
  allDay: event.allDay,
  start: occurrence.start,
  end: occurrence.end,
  ...(event.allDay ? { startDay: occurrence.day, endDay: occurrence.endDay } : {}),
  repeat: event.repeat ?? null,
  remindMinutes: event.remindMinutes ?? null,
});

const findOwned = async (id: string, userId: string): Promise<EventDoc> => {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Event");
  const event = await CalendarEvent.findOne({ _id: id, userId });
  if (!event) throw new NotFoundError("Event");
  return event;
};

/** Checks the timing is complete and ordered, and refreshes the reminder. */
const settle = (event: EventDoc, now = new Date()) => {
  if (event.allDay) {
    if (!event.startDay) throw new BadRequestError("An all-day event needs startDay");
    if (!event.endDay || event.endDay < event.startDay) event.endDay = event.startDay;
    event.start = null;
    event.end = null;
  } else {
    if (!event.start || !event.end) throw new BadRequestError("A timed event needs start and end");
    if (event.end <= event.start) event.end = new Date(event.start.getTime() + 30 * 60_000);
    event.startDay = null;
    event.endDay = null;
  }
  if (event.repeat?.until && event.repeat.until < (event.startDay ?? localDateKey(event.start as Date, event.timeZone))) {
    throw new BadRequestError("repeat.until is before the event starts");
  }
  event.nextReminderAt = nextReminder(event, now);
};

/** Occurrences of the user's events between two days (inclusive), in the request's zone. */
export const listOccurrences = async (
  userId: string,
  fromDay: string,
  toDay: string,
  timeZone: string,
): Promise<OccurrenceView[]> => {
  const from = zonedInstant(fromDay, "00:00", timeZone);
  const to = zonedInstant(addDays(toDay, 1), "00:00", timeZone);
  const events = await CalendarEvent.find({
    userId,
    $or: [
      { repeat: { $ne: null } },
      { allDay: true, startDay: { $lte: addDays(toDay, 1) }, endDay: { $gte: addDays(fromDay, -1) } },
      { allDay: false, start: { $lt: to }, end: { $gt: from } },
    ],
  });
  return events
    .flatMap((event) => expandOccurrences(event, from, to).map((occurrence) => toView(event, occurrence)))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
};

const apply = (event: EventDoc, input: EventInput) => {
  if (input.title !== undefined) event.title = input.title;
  if (input.notes !== undefined) event.notes = input.notes;
  if (input.location !== undefined) event.location = input.location;
  if (input.color !== undefined) event.color = input.color;
  if (input.allDay !== undefined) event.allDay = input.allDay;
  if (input.startDay !== undefined) event.startDay = input.startDay;
  if (input.endDay !== undefined) event.endDay = input.endDay;
  if (input.start !== undefined) event.start = input.start;
  if (input.end !== undefined) event.end = input.end;
  if (input.repeat !== undefined) event.repeat = input.repeat;
  if (input.remindMinutes !== undefined) event.remindMinutes = input.remindMinutes;
};

export const createEvent = async (userId: string, input: EventInput, timeZone: string) => {
  const event = new CalendarEvent({ userId, timeZone });
  apply(event, input);
  settle(event);
  await event.save();
  const [first] = expandOccurrences(event, new Date(0), new Date(8.64e15));
  return first ? toView(event, first) : null;
};

/**
 * Updates the whole event (every occurrence). Moving one occurrence of a
 * repeating event shifts the series by the same amount, as most calendars do
 * for "all events"; `occurrenceDay` names the occurrence the user moved.
 */
export const updateEvent = async (
  userId: string,
  id: string,
  input: EventInput & { occurrenceDay?: string },
  timeZone: string,
) => {
  const event = await findOwned(id, userId);
  const { occurrenceDay, ...fields } = input;

  if (event.repeat && occurrenceDay) {
    // Moving one occurrence moves the series by the same number of days, to
    // the new time of day.
    if (event.allDay && fields.startDay && event.startDay) {
      const delta = daysBetween(occurrenceDay, fields.startDay);
      const length = fields.endDay ? daysBetween(fields.startDay, fields.endDay) : 0;
      fields.startDay = addDays(event.startDay, delta);
      fields.endDay = addDays(fields.startDay, Math.max(0, length));
    } else if (!event.allDay && fields.start && fields.end && event.start) {
      const baseDay = localDateKey(event.start, event.timeZone);
      const delta = daysBetween(occurrenceDay, localDateKey(fields.start, timeZone));
      const duration = fields.end.getTime() - fields.start.getTime();
      fields.start = zonedInstant(addDays(baseDay, delta), localTimeKey(fields.start, timeZone), timeZone);
      fields.end = new Date(fields.start.getTime() + duration);
    }
  }

  apply(event, fields);
  if (fields.start !== undefined || fields.allDay !== undefined) event.timeZone = timeZone;
  settle(event);
  await event.save();
  return { _id: String(event._id) };
};

/** Deletes the event, or with `occurrenceDay` only that occurrence of a repeating one. */
export const deleteEvent = async (userId: string, id: string, occurrenceDay?: string) => {
  const event = await findOwned(id, userId);
  if (event.repeat && occurrenceDay) {
    if (!event.exdates.includes(occurrenceDay)) event.exdates.push(occurrenceDay);
    settle(event);
    await event.save();
    return;
  }
  await event.deleteOne();
};

/** Events whose reminder is due, for the push job; advances each to its next reminder. */
export const claimDueReminders = async (now = new Date()) => {
  const due = await CalendarEvent.find({ nextReminderAt: { $lte: now, $ne: null } }).limit(200);
  const claimed: Array<{ event: EventDoc; at: Date }> = [];
  for (const event of due) {
    const at = event.nextReminderAt as Date;
    const result = await CalendarEvent.updateOne(
      { _id: event._id, nextReminderAt: at },
      { $set: { nextReminderAt: nextReminder(event, at) } },
    );
    // Only send reminders that are recent; a server asleep for hours skips stale ones.
    if (result.modifiedCount === 1 && now.getTime() - at.getTime() < 6 * 3_600_000) claimed.push({ event, at });
  }
  return claimed;
};
