import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { UserItemBase } from "../../core/domain";

/** Strength: sets × reps × weight. Cardio: duration and/or distance. */
export const EXERCISE_KINDS = ["strength", "cardio"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
  "core",
  "full_body",
  "other",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MAX_EXERCISE_NAME = 80;

/** One entry in the user's own exercise library. */
export interface IExercise extends UserItemBase {
  name: string;
  /** Lower-cased, whitespace-collapsed name: one "Bench press" per user. */
  nameKey: string;
  kind: ExerciseKind;
  muscleGroup?: MuscleGroup;
  notes?: string;
  /** Hidden from pickers; kept because past sessions or routines use it. */
  archived: boolean;
}

export type ExerciseDoc = HydratedDocument<IExercise>;

export const toNameKey = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

const ExerciseSchema = new Schema<IExercise>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: MAX_EXERCISE_NAME },
    nameKey: { type: String, required: true },
    kind: { type: String, enum: EXERCISE_KINDS, required: true },
    muscleGroup: { type: String, enum: MUSCLE_GROUPS },
    notes: { type: String, maxlength: 1000 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

ExerciseSchema.pre("validate", function () {
  if (this.name) this.nameKey = toNameKey(this.name);
});

// The library list: GET /exercises?archived=
ExerciseSchema.index({ userId: 1, archived: 1, name: 1 });
// Duplicate-name guard.
ExerciseSchema.index({ userId: 1, nameKey: 1 }, { unique: true });

const Exercise: Model<IExercise> = model<IExercise>("Exercise", ExerciseSchema);

export default Exercise;
