import { Schema, model } from "mongoose";
import type { RecurrenceType } from "../../core/domain/recurrence";

export interface ITodo {
  text: string;
  completed: boolean;
  recurrenceType: RecurrenceType;
  lastCompletedAt?: Date;
  completionCount: number;
  interactionType: "checkbox" | "hold";
  durationGoal: number;
  paused: boolean;
  pausedAt?: Date;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const TodoSchema = new Schema<ITodo>(
  {
    text: {
      type: String,
      required: [true, "Please add a task description"],
      trim: true,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    recurrenceType: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    lastCompletedAt: {
      type: Date,
      required: false,
    },
    completionCount: { type: Number, default: 0 },
    interactionType: {
      type: String,
      enum: ["checkbox", "hold"],
      default: "checkbox",
    },
    durationGoal: {
      type: Number,
      default: 0,
    },
    paused: {
      type: Boolean,
      default: false,
    },
    pausedAt: {
      type: Date,
      required: false,
    },
    userId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Todo = model<ITodo>("Todo", TodoSchema);

export default Todo;

