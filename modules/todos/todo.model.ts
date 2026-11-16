import { Schema, model, type Model, type Types } from "mongoose";
import { REPEAT_MODES, REPEAT_UNITS, type RepeatRule } from "./repeat";
import { RECURRENCE_TYPES, type RecurrenceType } from "../../core/domain";
import type { UserItemBase } from "../../core/domain";

/**
 * How a todo is ticked: a plain checkbox, or a timer that completes the task
 * once `durationGoal` minutes have been spent on it. ("hold", the old
 * press-and-hold mode, is migrated away at startup.)
 */
export const INTERACTION_TYPES = ["checkbox", "timer"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** A calendar day, `YYYY-MM-DD`: no time zone can shift it. */
export const DUE_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Upper bound on a timed task's target, in minutes. */
export const MAX_DURATION_GOAL = 24 * 60;

export interface ITodo extends UserItemBase {
  text: string;
  /** Raw stored completion. For recurring todos this may refer to a cycle that
   *  has already elapsed — use `isCurrentlyComplete` to get the live view. */
  completed: boolean;
  recurrenceType: RecurrenceType;
  lastCompletedAt?: Date;
  /** Total completions ever (one per cycle). Not a streak — see core/domain/streak. */
  completionCount: number;
  interactionType: InteractionType;
  /** Target minutes. Required (≥ 1) for timer tasks; a hint for checkboxes. */
  durationGoal: number;
  /** Timer progress banked by earlier start/pause sessions, in ms. */
  timerElapsedMs: number;
  /** Set while the timer is running. */
  timerStartedAt?: Date;
  /** Last change to the timer; banked progress from an elapsed cycle is void. */
  timerUpdatedAt?: Date;
  /** One-time tasks only: the day it should be done by. */
  dueDate?: string;
  /**
   * Manual position within its section (recurrence type), set by drag and
   * drop. Absent on tasks never reordered; the client orders those first by
   * its automatic rule.
   */
  order?: number;
  paused: boolean;
  pausedAt?: Date;
  /**
   * Habits only: cycles skipped on purpose (rest days), by the cycle's first
   * day `YYYY-MM-DD`. A skipped cycle doesn't count as missed.
   */
  skips: string[];
  /** Daily habits only: aim for this many days a week (1-6); null = every day. */
  perWeek?: number | null;
  /** A Lucide icon name shown before the title (habits); "" for none. */
  icon: string;

  /* ---- Tasks (recurrenceType "none"). Habits are the recurring ones. ---- */

  /** Rich-text body (HTML from the notes editor). */
  notes: string;
  checklist: Array<{ _id?: Types.ObjectId; text: string; done: boolean }>;
  areaId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  /** A heading inside the project. */
  headingId?: Types.ObjectId | null;
  tags: string[];
  important: boolean;
  /**
   * When to start: a day (`YYYY-MM-DD`), `someday`, or unset (Inbox when it
   * has no project or area, Anytime otherwise). The deadline is `dueDate`.
   */
  when?: string | null;
  /** On the `when` day, after work ("This Evening"). */
  evening: boolean;
  /** `HH:mm` on the `when` day; a reminder fires then. */
  time?: string | null;
  /** The zone `time` is in, captured when it's set. */
  timeZone?: string | null;
  /** The instant `when` + `time` + `timeZone` denote, for the reminder job. */
  reminderAt?: Date | null;
  reminderSentAt?: Date | null;
  repeat?: RepeatRule | null;
  /** Done tasks (Logbook). */
  completedAt?: Date | null;
  /** On a Logbook copy made when a repeating task was done: the task it came from. */
  repeatOf?: Types.ObjectId | null;
}

const TodoSchema = new Schema<ITodo>(
  {
    text: {
      type: String,
      required: [true, "Please add a task description"],
      trim: true,
      maxlength: [500, "Task description must be at most 500 characters"],
    },
    completed: { type: Boolean, default: false },
    recurrenceType: {
      type: String,
      enum: RECURRENCE_TYPES,
      default: "none",
    },
    lastCompletedAt: { type: Date, required: false },
    completionCount: { type: Number, default: 0, min: 0 },
    interactionType: {
      type: String,
      enum: INTERACTION_TYPES,
      default: "checkbox",
    },
    durationGoal: { type: Number, default: 0, min: 0, max: MAX_DURATION_GOAL },
    timerElapsedMs: { type: Number, default: 0, min: 0 },
    timerStartedAt: { type: Date },
    timerUpdatedAt: { type: Date },
    order: { type: Number },
    dueDate: {
      type: String,
      match: [DUE_DATE_PATTERN, "dueDate must be YYYY-MM-DD"],
    },
    paused: { type: Boolean, default: false },
    pausedAt: { type: Date, required: false },
    skips: { type: [String], default: [] },
    perWeek: { type: Number, min: 1, max: 6, default: null },
    icon: { type: String, default: "", maxlength: 60, match: [/^[a-z0-9-]*$/, "icon must be a Lucide icon name"] },
    notes: { type: String, default: "", maxlength: 200_000 },
    checklist: {
      type: [
        {
          text: { type: String, trim: true, maxlength: 500, default: "" },
          done: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    areaId: { type: Schema.Types.ObjectId, ref: "TodoArea", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "TodoProject", default: null },
    headingId: { type: Schema.Types.ObjectId, default: null },
    tags: { type: [String], default: [] },
    important: { type: Boolean, default: false },
    when: {
      type: String,
      default: null,
      validate: {
        validator: (value: string | null) =>
          value === null || value === "someday" || DUE_DATE_PATTERN.test(value),
        message: "when must be YYYY-MM-DD or someday",
      },
    },
    evening: { type: Boolean, default: false },
    time: { type: String, default: null, match: [/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm"] },
    timeZone: { type: String, default: null },
    reminderAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    repeat: {
      type: new Schema(
        {
          every: { type: Number, min: 1, max: 365, default: 1 },
          unit: { type: String, enum: REPEAT_UNITS, required: true },
          weekdays: { type: [Number], default: [] },
          mode: { type: String, enum: REPEAT_MODES, default: "fixed" },
          monthDay: { type: Number, min: -1, max: 31, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    completedAt: { type: Date, default: null },
    repeatOf: { type: Schema.Types.ObjectId, default: null },
    userId: { type: String, required: true },
  },
  { timestamps: true },
);

// Serves the dashboard query (active todos for a user) and the paused panel.
TodoSchema.index({ userId: 1, paused: 1, createdAt: -1 });
// The Logbook, newest first.
TodoSchema.index({ userId: 1, completedAt: -1 });
// The reminder job: due and not yet sent.
TodoSchema.index({ reminderAt: 1 });

const Todo: Model<ITodo> = model<ITodo>("Todo", TodoSchema);

/**
 * Converts the retired "hold" mode: holds with a target become timers, the
 * rest checkboxes. Idempotent and cheap, so it runs on every startup.
 * Uses the raw collection because "hold" is no longer a valid enum value.
 */
export const migrateLegacyHoldTodos = async (): Promise<number> => {
  const timers = await Todo.collection.updateMany(
    { interactionType: "hold", durationGoal: { $gt: 0 } },
    { $set: { interactionType: "timer" } },
  );
  const checkboxes = await Todo.collection.updateMany(
    { interactionType: "hold" },
    { $set: { interactionType: "checkbox" } },
  );
  return timers.modifiedCount + checkboxes.modifiedCount;
};

export default Todo;
