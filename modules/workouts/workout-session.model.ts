import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import type { UserItemBase } from "../../core/domain";
import { EXERCISE_KINDS, type ExerciseKind } from "./exercise.model";
import { DEFAULT_REST_SEC, MAX_REST_SEC } from "./routine.model";

export const SESSION_STATUSES = ["in_progress", "completed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const MAX_SESSION_ENTRIES = 30;
export const MAX_SESSION_SETS = 50;

/** One performed (or planned, until ticked) set. Units: kg, seconds, metres. */
export interface SessionSet {
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  distanceM?: number;
  done: boolean;
}

/**
 * An exercise within a session. Name and kind are snapshots so history reads
 * the same after the exercise is renamed or archived.
 */
export interface SessionEntry {
  exerciseId: Types.ObjectId;
  exerciseName: string;
  kind: ExerciseKind;
  restSec: number;
  sets: SessionSet[];
}

export interface IWorkoutSession extends UserItemBase {
  routineId?: Types.ObjectId;
  name: string;
  status: SessionStatus;
  startedAt: Date;
  finishedAt?: Date;
  notes?: string;
  entries: SessionEntry[];
}

export type WorkoutSessionDoc = HydratedDocument<IWorkoutSession>;

const SessionSetSchema = new Schema<SessionSet>(
  {
    reps: { type: Number, min: 0 },
    weightKg: { type: Number, min: 0 },
    durationSec: { type: Number, min: 0 },
    distanceM: { type: Number, min: 0 },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);

const SessionEntrySchema = new Schema<SessionEntry>(
  {
    exerciseId: { type: Schema.Types.ObjectId, ref: "Exercise", required: true },
    exerciseName: { type: String, required: true },
    kind: { type: String, enum: EXERCISE_KINDS, required: true },
    restSec: { type: Number, min: 0, max: MAX_REST_SEC, default: DEFAULT_REST_SEC },
    sets: { type: [SessionSetSchema], default: [] },
  },
  { _id: false },
);

const WorkoutSessionSchema = new Schema<IWorkoutSession>(
  {
    userId: { type: String, required: true },
    routineId: { type: Schema.Types.ObjectId, ref: "Routine" },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    status: { type: String, enum: SESSION_STATUSES, default: "in_progress" },
    startedAt: { type: Date, required: true, default: () => new Date() },
    finishedAt: { type: Date },
    notes: { type: String, maxlength: 2000 },
    entries: { type: [SessionEntrySchema], default: [] },
  },
  { timestamps: true },
);

// At most one live session per user; also serves GET /sessions/active.
WorkoutSessionSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "in_progress" } },
);
// History list, heatmap and Today summary.
WorkoutSessionSchema.index({ userId: 1, startedAt: -1 });
// Per-exercise progress and "last time" prefill.
WorkoutSessionSchema.index({ userId: 1, "entries.exerciseId": 1, startedAt: -1 });

const WorkoutSession: Model<IWorkoutSession> = model<IWorkoutSession>(
  "WorkoutSession",
  WorkoutSessionSchema,
);

export default WorkoutSession;
