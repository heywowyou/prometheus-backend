import { Schema, model, type Model } from "mongoose";
import { RECURRENCE_TYPES, type RecurrenceType } from "../../core/domain";
import type { UserItemBase } from "../../core/domain";

export const INTERACTION_TYPES = ["checkbox", "hold"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export interface ITodo extends UserItemBase {
  text: string;
  /** Raw stored completion. For recurring todos this may refer to a cycle that
   *  has already elapsed — use `isCurrentlyComplete` to get the live view. */
  completed: boolean;
  recurrenceType: RecurrenceType;
  lastCompletedAt?: Date;
  completionCount: number;
  interactionType: InteractionType;
  durationGoal: number;
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
    durationGoal: { type: Number, default: 0, min: 0 },
    paused: { type: Boolean, default: false },
    pausedAt: { type: Date, required: false },
    userId: { type: String, required: true },
  },
  { timestamps: true },
);

// Serves the dashboard query (active todos for a user) and the paused panel.
TodoSchema.index({ userId: 1, paused: 1, createdAt: -1 });

const Todo: Model<ITodo> = model<ITodo>("Todo", TodoSchema);

export default Todo;
