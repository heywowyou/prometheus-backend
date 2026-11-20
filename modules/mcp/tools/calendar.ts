import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import CalendarEvent, { EVENT_COLORS, REMIND_OPTIONS, type EventRepeat } from "../../calendar/calendar-event.model";
import * as CalendarService from "../../calendar/calendar.service";
import { addDays, daysBetween } from "../../todos/repeat";
import { BadRequestError, NotFoundError } from "../../../core/errors/AppError";
import {
  compact,
  describeRepeat,
  idSchema,
  localDay,
  localStamp,
  resolveDay,
  resolveInstant,
  run,
  todayOf,
  weekdayIndexes,
  weekdaySchema,
  type McpContext,
} from "../context";

const DAY_ONLY = /^(\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday)$/i;

export const occurrenceSummary = (event: CalendarService.OccurrenceView, ctx: McpContext) =>
  compact({
    id: event.eventId,
    occurrenceDay: event.repeat ? event.occurrenceDay : undefined,
    title: event.title || "Untitled",
    allDay: event.allDay,
    start: event.allDay ? event.startDay : localStamp(event.start, ctx),
    end: event.allDay ? (event.endDay !== event.startDay ? event.endDay : undefined) : localStamp(event.end, ctx),
    location: event.location,
    notes: event.notes,
    color: event.color !== "sage" ? event.color : undefined,
    repeat: describeRepeat(event.repeat),
    reminder: event.remindMinutes !== null ? `${event.remindMinutes} min before` : undefined,
  });

const repeatSchema = z.object({
  every: z.number().int().min(1).max(365).default(1),
  unit: z.enum(["day", "week", "month", "year"]),
  weekdays: z.array(weekdaySchema).optional().describe("Weekly only, e.g. [\"mon\", \"wed\"]"),
  until: z.string().nullable().optional().describe("Last day an occurrence may start, YYYY-MM-DD"),
});

const toRepeat = (input: z.infer<typeof repeatSchema> | null, ctx: McpContext): EventRepeat | null =>
  input
    ? {
        every: input.every,
        unit: input.unit,
        weekdays: input.unit === "week" ? weekdayIndexes(input.weekdays) : [],
        until: input.until ? resolveDay(input.until, ctx, "repeat.until") : null,
      }
    : null;

const eventFields = {
  location: z.string().max(200).optional(),
  notes: z.string().max(20_000).optional().describe("Plain text"),
  color: z.enum(EVENT_COLORS).optional().describe("red is for genuinely urgent things only"),
  repeat: repeatSchema.nullable().optional(),
  reminderMinutes: z
    .number()
    .int()
    .refine((value) => (REMIND_OPTIONS as readonly number[]).includes(value), {
      message: `must be one of ${REMIND_OPTIONS.join(", ")}`,
    })
    .nullable()
    .optional()
    .describe(`Minutes before the start to send a reminder: ${REMIND_OPTIONS.join(", ")}; null for none`),
};

/** start/end strings to the service's timing fields. A date alone means an all-day event. */
const toTiming = (
  start: string,
  end: string | undefined,
  durationMinutes: number | undefined,
  ctx: McpContext,
): CalendarService.EventInput => {
  if (DAY_ONLY.test(start.trim())) {
    const startDay = resolveDay(start, ctx, "start");
    const endDay = end ? resolveDay(end, ctx, "end") : startDay;
    if (endDay < startDay) throw new BadRequestError("end is before start");
    return { allDay: true, startDay, endDay };
  }
  const startAt = resolveInstant(start, ctx, "start");
  const endAt = end
    ? resolveInstant(end, ctx, "end")
    : new Date(startAt.getTime() + (durationMinutes ?? 60) * 60_000);
  if (endAt <= startAt) throw new BadRequestError("end must be after start");
  return { allDay: false, start: startAt, end: endAt };
};

const findEvent = async (id: string, ctx: McpContext) => {
  const event = await CalendarEvent.findOne({ _id: id, userId: ctx.userId });
  if (!event) throw new NotFoundError("Event");
  return event;
};

/** The event's first occurrence on or after `near` (default: its own start). */
const showEvent = async (id: string, ctx: McpContext, near?: string) => {
  const event = await findEvent(id, ctx);
  const day = near ?? (event.allDay ? event.startDay : localDay(event.start, ctx)) ?? todayOf(ctx);
  const occurrences = await CalendarService.listOccurrences(ctx.userId, day, addDays(day, 400), ctx.timeZone);
  const next = occurrences.find((occurrence) => occurrence.eventId === id);
  return next ? occurrenceSummary(next, ctx) : { id, title: event.title, note: "No occurrence in the next 400 days" };
};

export const registerCalendarTools = (server: McpServer, ctx: McpContext) => {
  server.registerTool(
    "list_events",
    {
      title: "List calendar events",
      description:
        "Calendar events between two days (inclusive), repeating events expanded into occurrences. Times are local. Defaults to the next 7 days. Scheduled tasks are not events: see list_tasks.",
      inputSchema: {
        from: z.string().optional().describe("YYYY-MM-DD or today; default today"),
        to: z.string().optional().describe("YYYY-MM-DD; default 7 days after from"),
        query: z.string().optional().describe("Only events whose title, location or notes contain this"),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ from, to, query }) => {
      const fromDay = from ? resolveDay(from, ctx, "from") : todayOf(ctx);
      const toDay = to ? resolveDay(to, ctx, "to") : addDays(fromDay, 7);
      if (toDay < fromDay || daysBetween(fromDay, toDay) > 400) {
        throw new BadRequestError("from..to must span 0 to 400 days");
      }
      let events = await CalendarService.listOccurrences(ctx.userId, fromDay, toDay, ctx.timeZone);
      if (query) {
        const needle = query.toLowerCase();
        events = events.filter((event) =>
          [event.title, event.location, event.notes].some((field) => field?.toLowerCase().includes(needle)),
        );
      }
      return { from: fromDay, to: toDay, timeZone: ctx.timeZone, events: events.map((e) => occurrenceSummary(e, ctx)) };
    }),
  );

  server.registerTool(
    "create_event",
    {
      title: "Create a calendar event",
      description:
        "Adds an event. start as YYYY-MM-DDTHH:mm (local time) makes a timed event, ending at end or after durationMinutes (default 60). start as YYYY-MM-DD makes an all-day event, end being its last day.",
      inputSchema: {
        title: z.string().min(1).max(200),
        start: z.string(),
        end: z.string().optional(),
        durationMinutes: z.number().int().min(5).max(60 * 24 * 14).optional(),
        ...eventFields,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    run(async ({ title, start, end, durationMinutes, location, notes, color, repeat, reminderMinutes }) => {
      const created = await CalendarService.createEvent(
        ctx.userId,
        {
          title,
          ...toTiming(start, end, durationMinutes, ctx),
          ...(location !== undefined ? { location } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(color ? { color } : {}),
          ...(repeat !== undefined ? { repeat: toRepeat(repeat, ctx) } : {}),
          ...(reminderMinutes !== undefined ? { remindMinutes: reminderMinutes } : {}),
        },
        ctx.timeZone,
      );
      if (!created) return { note: "Created, but it has no occurrence (check repeat.until)." };
      return occurrenceSummary(created, ctx);
    }),
  );

  server.registerTool(
    "update_event",
    {
      title: "Update a calendar event",
      description:
        "Changes an event. Only the fields you pass change. For a repeating event, changes apply to the whole series; to move it, pass occurrenceDay (the occurrence you are moving) and the series shifts by the same amount. Passing start without end keeps the duration.",
      inputSchema: {
        id: idSchema,
        occurrenceDay: z.string().optional().describe("YYYY-MM-DD of the occurrence being moved (repeating events)"),
        title: z.string().min(1).max(200).optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        ...eventFields,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id, occurrenceDay, title, start, end, location, notes, color, repeat, reminderMinutes }) => {
      const event = await findEvent(id, ctx);
      const input: CalendarService.EventInput & { occurrenceDay?: string } = {};
      if (title !== undefined) input.title = title;
      if (location !== undefined) input.location = location;
      if (notes !== undefined) input.notes = notes;
      if (color !== undefined) input.color = color;
      if (repeat !== undefined) input.repeat = toRepeat(repeat, ctx);
      if (reminderMinutes !== undefined) input.remindMinutes = reminderMinutes;

      if (start !== undefined || end !== undefined) {
        if (start === undefined) {
          // Only the end moves: keep the start as it is.
          const startText = event.allDay
            ? (event.startDay as string)
            : (localStamp(event.start as Date, ctx) as string).replace(" ", "T");
          Object.assign(input, toTiming(startText, end, undefined, ctx));
        } else {
          let duration: number | undefined;
          let endText = end;
          if (end === undefined) {
            if (event.allDay && event.startDay && event.endDay && DAY_ONLY.test(start.trim())) {
              endText = addDays(resolveDay(start, ctx, "start"), daysBetween(event.startDay, event.endDay));
            } else if (!event.allDay && event.start && event.end) {
              duration = Math.round((event.end.getTime() - event.start.getTime()) / 60_000);
            }
          }
          Object.assign(input, toTiming(start, endText, duration, ctx));
        }
        if (event.repeat) {
          input.occurrenceDay = occurrenceDay
            ? resolveDay(occurrenceDay, ctx, "occurrenceDay")
            : (event.startDay ?? localDay(event.start, ctx));
        }
      }

      await CalendarService.updateEvent(ctx.userId, id, input, ctx.timeZone);
      return showEvent(id, ctx, input.startDay ?? localDay(input.start, ctx));
    }),
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete a calendar event",
      description:
        "Deletes an event. For a repeating event, pass occurrenceDay to remove only that occurrence; without it the whole series goes.",
      inputSchema: {
        id: idSchema,
        occurrenceDay: z.string().optional().describe("YYYY-MM-DD of the single occurrence to remove"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    run(async ({ id, occurrenceDay }) => {
      const event = await findEvent(id, ctx);
      const day = occurrenceDay ? resolveDay(occurrenceDay, ctx, "occurrenceDay") : undefined;
      await CalendarService.deleteEvent(ctx.userId, id, day);
      return event.repeat && day
        ? { removedOccurrence: day, of: event.title }
        : { deleted: id, title: event.title };
    }),
  );
};
