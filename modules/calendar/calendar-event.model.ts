import { Schema, model, type Model } from "mongoose";
import { REPEAT_UNITS, type RepeatUnit } from "../todos/repeat";

/** Calm hues, plus red for what is genuinely urgent. */
export const EVENT_COLORS = ["sage", "teal", "blue", "sky", "stone", "red"] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

/** Retired warm and purple colors, and the calm color each became. */
const LEGACY_COLORS: Record<string, EventColor> = { violet: "sky", amber: "stone", orange: "teal" };

/** Minutes before the start a reminder fires; `null` for none. */
export const REMIND_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

export interface EventRepeat {
  every: number;
  unit: RepeatUnit;
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** Last day an occurrence may start on, `YYYY-MM-DD`. */
  until?: string | null;
}

export interface ICalendarEvent {
  userId: string;
  title: string;
  notes: string;
  location: string;
  color: EventColor;
  allDay: boolean;
  /** All-day events: first and last day, inclusive. */
  startDay?: string | null;
  endDay?: string | null;
  /** Timed events. */
  start?: Date | null;
  end?: Date | null;
  /** The zone the event was created in; repeats keep its wall-clock time. */
  timeZone: string;
  repeat?: EventRepeat | null;
  /** Start days of occurrences removed from a repeating event. */
  exdates: string[];
  remindMinutes?: number | null;
  /** When the next reminder is due (the reminder job's index). */
  nextReminderAt?: Date | null;
}

const CalendarEventSchema = new Schema<ICalendarEvent>(
  {
    userId: { type: String, required: true },
    title: { type: String, trim: true, maxlength: 200, default: "" },
    notes: { type: String, maxlength: 20_000, default: "" },
    location: { type: String, trim: true, maxlength: 200, default: "" },
    color: { type: String, enum: EVENT_COLORS, default: "sage" },
    allDay: { type: Boolean, default: false },
    startDay: { type: String, default: null },
    endDay: { type: String, default: null },
    start: { type: Date, default: null },
    end: { type: Date, default: null },
    timeZone: { type: String, required: true },
    repeat: {
      type: new Schema(
        {
          every: { type: Number, min: 1, max: 365, default: 1 },
          unit: { type: String, enum: REPEAT_UNITS, required: true },
          weekdays: { type: [Number], default: [] },
          until: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    exdates: { type: [String], default: [] },
    remindMinutes: { type: Number, default: null },
    nextReminderAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CalendarEventSchema.index({ userId: 1, start: 1 });
CalendarEventSchema.index({ userId: 1, startDay: 1 });
CalendarEventSchema.index({ nextReminderAt: 1 });

const CalendarEvent: Model<ICalendarEvent> = model<ICalendarEvent>("CalendarEvent", CalendarEventSchema);

export default CalendarEvent;

/** Moves events off the retired colors. Idempotent, so it runs on every boot. */
export const migrateEventColors = async (): Promise<number> => {
  let changed = 0;
  for (const [from, to] of Object.entries(LEGACY_COLORS)) {
    const result = await CalendarEvent.collection.updateMany({ color: from }, { $set: { color: to } });
    changed += result.modifiedCount;
  }
  return changed;
};
