import { Schema, model, type Model } from "mongoose";
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
  /** Total completions ever (one per cycle). Not a streak — see todo.streak. */
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
    userId: { type: String, required: true },
  },
  { timestamps: true },
);

// Serves the dashboard query (active todos for a user) and the paused panel.
TodoSchema.index({ userId: 1, paused: 1, createdAt: -1 });

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
