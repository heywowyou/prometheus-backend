import { Schema, model, type Document, type Model } from "mongoose";
import type { RecurrenceType } from "../../core/domain/recurrence";

export interface TodoDocument extends Document {
  text: string;
  completed: boolean;
  recurrenceType: RecurrenceType;
  lastCompletedAt?: Date;
  completionCount: number;
  interactionType: "checkbox" | "hold";
  durationGoal: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const TodoSchema = new Schema<TodoDocument>(
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
    userId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Todo: Model<TodoDocument> = model<TodoDocument>("Todo", TodoSchema);

export default Todo;

