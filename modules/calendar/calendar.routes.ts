import { Router } from "express";
import { getUserId, requireUser } from "../../core/auth";
import {
  asBoolean,
  asDate,
  asEnum,
  asNumber,
  asRequiredString,
  asString,
  asyncHandler,
  getRequestTimeZone,
  supplied,
} from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import { DAY_PATTERN, REPEAT_UNITS, daysBetween } from "../todos/repeat";
import { EVENT_COLORS, REMIND_OPTIONS, type EventRepeat } from "./calendar-event.model";
import * as CalendarService from "./calendar.service";

const router = Router();
router.use(requireUser);

const asDay = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) throw new BadRequestError(`${field} must be YYYY-MM-DD`);
  return value;
};

const parseRepeat = (value: unknown): EventRepeat | null => {
  if (value === null) return null;
  if (typeof value !== "object") throw new BadRequestError("repeat must be an object or null");
  const r = value as Record<string, unknown>;
  const unit = asEnum(r.unit, "repeat.unit", REPEAT_UNITS);
  if (!unit) throw new BadRequestError("repeat.unit is required");
  const weekdays = Array.isArray(r.weekdays)
    ? [...new Set(r.weekdays.map(Number))].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  return {
    every: asNumber(r.every, "repeat.every", { min: 1, max: 365, integer: true }) ?? 1,
    unit,
    weekdays: unit === "week" ? weekdays : [],
    until: r.until === null || r.until === undefined || r.until === "" ? null : asDay(r.until, "repeat.until"),
  };
};

const parseEvent = (body: unknown): CalendarService.EventInput => {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: CalendarService.EventInput = {};
  if (supplied(b, "title")) out.title = asString(b.title, "title", { maxLength: 200 }) ?? "";
  if (supplied(b, "notes")) out.notes = asString(b.notes, "notes", { maxLength: 20_000 }) ?? "";
  if (supplied(b, "location")) out.location = asString(b.location, "location", { maxLength: 200 }) ?? "";
  if (supplied(b, "color")) out.color = asEnum(b.color, "color", EVENT_COLORS);
  if (supplied(b, "allDay")) out.allDay = asBoolean(b.allDay, "allDay");
  if (supplied(b, "startDay")) out.startDay = asDay(b.startDay, "startDay");
  if (supplied(b, "endDay")) out.endDay = asDay(b.endDay, "endDay");
  if (supplied(b, "start")) out.start = asDate(b.start, "start");
  if (supplied(b, "end")) out.end = asDate(b.end, "end");
  if (supplied(b, "repeat")) out.repeat = parseRepeat(b.repeat);
  if (supplied(b, "remindMinutes")) {
    if (b.remindMinutes === null) out.remindMinutes = null;
    else {
      const minutes = asNumber(b.remindMinutes, "remindMinutes", { min: 0, max: 10_080, integer: true });
      if (minutes === undefined || !(REMIND_OPTIONS as readonly number[]).includes(minutes)) {
        throw new BadRequestError(`remindMinutes must be one of ${REMIND_OPTIONS.join(", ")} or null`);
      }
      out.remindMinutes = minutes;
    }
  }
  return out;
};

/** Occurrences between two days, inclusive (at most a little over a year). */
router.get(
  "/events",
  asyncHandler(async (req, res) => {
    const from = asDay(req.query.from, "from");
    const to = asDay(req.query.to, "to");
    if (to < from || daysBetween(from, to) > 400) throw new BadRequestError("from..to must span 0 to 400 days");
    res.status(200).json(await CalendarService.listOccurrences(getUserId(req), from, to, getRequestTimeZone(req)));
  }),
);

router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const input = parseEvent(req.body);
    res.status(201).json(await CalendarService.createEvent(getUserId(req), input, getRequestTimeZone(req)));
  }),
);

router.patch(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const occurrenceDay = supplied(b, "occurrenceDay") ? asDay(b.occurrenceDay, "occurrenceDay") : undefined;
    res
      .status(200)
      .json(
        await CalendarService.updateEvent(
          getUserId(req),
          asRequiredString(req.params.id, "id", { maxLength: 40 }),
          { ...parseEvent(b), occurrenceDay },
          getRequestTimeZone(req),
        ),
      );
  }),
);

/** `?occurrence=YYYY-MM-DD` removes one occurrence of a repeating event. */
router.delete(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const occurrence = req.query.occurrence ? asDay(req.query.occurrence, "occurrence") : undefined;
    await CalendarService.deleteEvent(getUserId(req), asRequiredString(req.params.id, "id", { maxLength: 40 }), occurrence);
    res.status(204).send();
  }),
);

export default router;
