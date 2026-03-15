import { Schema, model, type Document, type Model, type Types } from "mongoose";

export interface TodoHistoryDocument extends Document {
  todoId: Types.ObjectId;
  userId: string;
  completedAt: Date;
  streakSnapshot?: number;
}

const TodoHistorySchema = new Schema<TodoHistoryDocument>({
  todoId: {
    type: Schema.Types.ObjectId,
    ref: "Todo",
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  completedAt: {
    type: Date,
    default: Date.now,
  },
  streakSnapshot: {
    type: Number,
  },
});

const TodoHistory: Model<TodoHistoryDocument> = model<TodoHistoryDocument>(
  "TodoHistory",
  TodoHistorySchema
);

export default TodoHistory;

