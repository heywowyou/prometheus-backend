import { Schema, model, type Model, type Types } from "mongoose";

export interface ITodoHistory {
  todoId: Types.ObjectId;
  userId: string;
  completedAt: Date;
  tallySnapshot?: number;
}

const TodoHistorySchema = new Schema<ITodoHistory>({
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
  tallySnapshot: {
    type: Number,
  },
});

const TodoHistory: Model<ITodoHistory> = model<ITodoHistory>(
  "TodoHistory",
  TodoHistorySchema
);

export default TodoHistory;

