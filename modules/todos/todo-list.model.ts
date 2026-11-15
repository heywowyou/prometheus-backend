import { Schema, model, type Model, type Types } from "mongoose";

/** An area of life ("Home", "Work"): holds projects and loose tasks. */
export interface ITodoArea {
  userId: string;
  title: string;
  order: number;
}

const TodoAreaSchema = new Schema<ITodoArea>(
  {
    userId: { type: String, required: true },
    title: { type: String, trim: true, maxlength: 120, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
TodoAreaSchema.index({ userId: 1, order: 1 });

export const TodoArea: Model<ITodoArea> = model<ITodoArea>("TodoArea", TodoAreaSchema);

export interface ITodoHeading {
  _id: Types.ObjectId;
  title: string;
}

/** A project: an outcome with a set of tasks, optionally inside an area. */
export interface ITodoProject {
  userId: string;
  title: string;
  notes: string;
  areaId?: Types.ObjectId | null;
  order: number;
  headings: Types.DocumentArray<ITodoHeading>;
  /** `someday` parks the project; a day schedules it; unset is active. */
  when?: string | null;
  /** Deadline, `YYYY-MM-DD`. */
  dueDate?: string | null;
  completedAt?: Date | null;
}

const TodoProjectSchema = new Schema<ITodoProject>(
  {
    userId: { type: String, required: true },
    title: { type: String, trim: true, maxlength: 200, default: "" },
    notes: { type: String, default: "", maxlength: 200_000 },
    areaId: { type: Schema.Types.ObjectId, ref: "TodoArea", default: null },
    order: { type: Number, default: 0 },
    headings: {
      type: [{ title: { type: String, trim: true, maxlength: 120, default: "" } }],
      default: [],
    },
    when: { type: String, default: null },
    dueDate: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
TodoProjectSchema.index({ userId: 1, completedAt: 1, order: 1 });

export const TodoProject: Model<ITodoProject> = model<ITodoProject>(
  "TodoProject",
  TodoProjectSchema,
);
