import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import type { UserItemBase } from "../../core/domain";

export const MAX_ROUTINE_EXERCISES = 30;
export const MAX_SETS = 20;
export const DEFAULT_REST_SEC = 90;
export const MAX_REST_SEC = 15 * 60;

/** One exercise slot in a routine, with the targets a new session starts from. */
export interface RoutineExercise {
  exerciseId: Types.ObjectId;
  sets: number;
  targetReps?: number;
  targetWeightKg?: number;
  targetDurationSec?: number;
  targetDistanceM?: number;
  restSec: number;
}

/** A saved workout template ("Push day") that a session is started from. */
export interface IRoutine extends UserItemBase {
  name: string;
  notes?: string;
  /** Manual position on the Start tab. */
  order: number;
  exercises: RoutineExercise[];
}

export type RoutineDoc = HydratedDocument<IRoutine>;

const RoutineExerciseSchema = new Schema<RoutineExercise>(
  {
    exerciseId: { type: Schema.Types.ObjectId, ref: "Exercise", required: true },
    sets: { type: Number, required: true, min: 1, max: MAX_SETS },
    targetReps: { type: Number, min: 0 },
    targetWeightKg: { type: Number, min: 0 },
    targetDurationSec: { type: Number, min: 0 },
    targetDistanceM: { type: Number, min: 0 },
    restSec: { type: Number, min: 0, max: MAX_REST_SEC, default: DEFAULT_REST_SEC },
  },
  { _id: false },
);

const RoutineSchema = new Schema<IRoutine>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    notes: { type: String, maxlength: 1000 },
    order: { type: Number, default: 0 },
    exercises: { type: [RoutineExerciseSchema], default: [] },
  },
  { timestamps: true },
);

// GET /routines, in Start-tab order.
RoutineSchema.index({ userId: 1, order: 1 });
// "Is this exercise still used?" before deleting it.
RoutineSchema.index({ userId: 1, "exercises.exerciseId": 1 });

const Routine: Model<IRoutine> = model<IRoutine>("Routine", RoutineSchema);

export default Routine;
