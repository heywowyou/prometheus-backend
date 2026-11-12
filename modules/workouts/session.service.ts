import { Types } from "mongoose";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError";
import Exercise from "./exercise.model";
import { DEFAULT_REST_SEC } from "./routine.model";
import { findOwnedRoutine } from "./routine.service";
import WorkoutSession, {
  type SessionEntry,
  type SessionSet,
  type WorkoutSessionDoc,
} from "./workout-session.model";
import { recordsBefore } from "./progress.service";
import { beatenRecords, exerciseMetrics, recordValues, type PrType } from "./workout.metrics";

export interface SessionSetInput {
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  distanceM?: number;
  done: boolean;
}

export interface SessionEntryInput {
  exerciseId: string;
  restSec?: number;
  sets: SessionSetInput[];
}

export interface SessionUpdateInput {
  name?: string;
  notes?: string;
  startedAt?: Date;
  finishedAt?: Date;
  entries?: SessionEntryInput[];
}

export interface SessionPr {
  exerciseId: string;
  exerciseName: string;
  types: PrType[];
}

const sessionInProgress = () =>
  new ConflictError("SESSION_IN_PROGRESS", "Finish or discard your current workout first");

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

export const findOwnedSession = async (
  id: string,
  userId: string,
): Promise<WorkoutSessionDoc> => {
  const session = await WorkoutSession.findById(id);
  if (!session) throw new NotFoundError("Workout");
  if (session.userId !== userId) throw new ForbiddenError();
  return session;
};

/**
 * The sets logged the last time each exercise was done (in a completed
 * session), unticked, ready to prefill a new session.
 */
export const lastSetsFor = async (
  userId: string,
  exerciseIds: Types.ObjectId[],
): Promise<Map<string, SessionSet[]>> => {
  if (exerciseIds.length === 0) return new Map();

  const rows = await WorkoutSession.aggregate<{ _id: Types.ObjectId; sets: SessionSet[] }>([
    { $match: { userId, status: "completed", "entries.exerciseId": { $in: exerciseIds } } },
    { $sort: { startedAt: -1 } },
    { $unwind: "$entries" },
    { $match: { "entries.exerciseId": { $in: exerciseIds } } },
    { $group: { _id: "$entries.exerciseId", sets: { $first: "$entries.sets" } } },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      row.sets.map(({ reps, weightKg, durationSec, distanceM }) => ({
        reps,
        weightKg,
        durationSec,
        distanceM,
        done: false,
      })),
    ]),
  );
};

export const getActiveSession = (userId: string): Promise<WorkoutSessionDoc | null> =>
  WorkoutSession.findOne({ userId, status: "in_progress" });

export const listSessions = async (
  userId: string,
  opts: { before?: Date; limit: number },
): Promise<WorkoutSessionDoc[]> =>
  WorkoutSession.find({
    userId,
    status: "completed",
    ...(opts.before ? { startedAt: { $lt: opts.before } } : {}),
  })
    .sort({ startedAt: -1 })
    .limit(opts.limit);

export const getSession = (id: string, userId: string): Promise<WorkoutSessionDoc> =>
  findOwnedSession(id, userId);

/**
 * Starts a live session — empty, or from a routine with each exercise
 * prefilled from last time (falling back to the routine's targets).
 */
export const startSession = async (
  userId: string,
  routineId?: string,
): Promise<WorkoutSessionDoc> => {
  if (await getActiveSession(userId)) throw sessionInProgress();

  let name = "Workout";
  let entries: SessionEntry[] = [];

  if (routineId) {
    const routine = await findOwnedRoutine(routineId, userId);
    name = routine.name;

    const ids = routine.exercises.map((e) => e.exerciseId);
    const [exercises, previous] = await Promise.all([
      Exercise.find({ _id: { $in: ids }, userId }),
      lastSetsFor(userId, ids),
    ]);
    const byId = new Map(exercises.map((e) => [String(e._id), e]));

    entries = routine.exercises.flatMap((slot): SessionEntry[] => {
      const exercise = byId.get(String(slot.exerciseId));
      if (!exercise) return [];

      const last = previous.get(String(slot.exerciseId)) ?? [];
      const target: SessionSet = {
        reps: slot.targetReps,
        weightKg: slot.targetWeightKg,
        durationSec: slot.targetDurationSec,
        distanceM: slot.targetDistanceM,
        done: false,
      };
      const sets = Array.from(
        { length: slot.sets },
        (_, i): SessionSet => ({ ...(last[i] ?? last[last.length - 1] ?? target), done: false }),
      );

      return [
        {
          exerciseId: exercise._id,
          exerciseName: exercise.name,
          kind: exercise.kind,
          restSec: slot.restSec,
          sets,
        },
      ];
    });
  }

  try {
    return await WorkoutSession.create({
      userId,
      routineId: routineId ? new Types.ObjectId(routineId) : undefined,
      name,
      status: "in_progress",
      startedAt: new Date(),
      entries,
    });
  } catch (error) {
    // Two starts racing: the partial unique index lets only one through.
    if (isDuplicateKey(error)) throw sessionInProgress();
    throw error;
  }
};

/**
 * Turns client entries into stored ones. Exercises already in the session
 * keep their name/kind snapshot; new ones are looked up (and must be owned).
 */
const toEntries = async (
  session: WorkoutSessionDoc,
  input: SessionEntryInput[],
  userId: string,
): Promise<SessionEntry[]> => {
  const known = new Map(
    session.entries.map((e) => [String(e.exerciseId), { name: e.exerciseName, kind: e.kind }]),
  );
  const missing = [...new Set(input.map((e) => e.exerciseId))].filter((id) => !known.has(id));

  if (missing.length > 0) {
    if (!missing.every((id) => Types.ObjectId.isValid(id))) {
      throw new BadRequestError("entries contain an invalid exerciseId");
    }
    const found = await Exercise.find({ _id: { $in: missing }, userId });
    if (found.length !== missing.length) throw new NotFoundError("Exercise");
    for (const e of found) known.set(String(e._id), { name: e.name, kind: e.kind });
  }

  return input.map((entry) => {
    const snapshot = known.get(entry.exerciseId)!;
    return {
      exerciseId: new Types.ObjectId(entry.exerciseId),
      exerciseName: snapshot.name,
      kind: snapshot.kind,
      restSec: entry.restSec ?? DEFAULT_REST_SEC,
      sets: entry.sets.map((set) => ({
        // Only the fields that make sense for the kind are kept.
        ...(snapshot.kind === "strength"
          ? { reps: set.reps, weightKg: set.weightKg }
          : { durationSec: set.durationSec, distanceM: set.distanceM }),
        done: set.done,
      })),
    };
  });
};

/** Autosave target for the live screen; also edits a finished session. */
export const updateSession = async (
  id: string,
  userId: string,
  input: SessionUpdateInput,
): Promise<WorkoutSessionDoc> => {
  const session = await findOwnedSession(id, userId);

  if (input.name !== undefined) {
    if (!input.name) throw new BadRequestError("name is required");
    session.name = input.name;
  }
  if (input.notes !== undefined) session.notes = input.notes || undefined;
  if (input.startedAt !== undefined) session.startedAt = input.startedAt;
  if (input.finishedAt !== undefined) {
    if (session.status !== "completed") {
      throw new BadRequestError("Use finish to end a workout in progress");
    }
    session.finishedAt = input.finishedAt;
  }
  if (session.finishedAt && session.finishedAt < session.startedAt) {
    throw new BadRequestError("finishedAt must be after startedAt");
  }
  if (input.entries !== undefined) {
    session.set("entries", await toEntries(session, input.entries, userId));
  }

  return session.save();
};

/**
 * Ends a live session: unticked sets and empty exercises are dropped, and the
 * response lists the personal records this workout beat.
 */
export const finishSession = async (
  id: string,
  userId: string,
): Promise<{ session: WorkoutSessionDoc; prs: SessionPr[] }> => {
  const session = await findOwnedSession(id, userId);
  if (session.status !== "in_progress") {
    throw new BadRequestError("This workout is already finished");
  }

  const entries = session.entries
    .map((entry) => ({
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      kind: entry.kind,
      restSec: entry.restSec,
      sets: entry.sets.filter((set) => set.done),
    }))
    .filter((entry) => entry.sets.length > 0);

  if (entries.length === 0) {
    throw new BadRequestError("Tick at least one set before finishing, or discard the workout");
  }

  const previous = await recordsBefore(
    userId,
    entries.map((e) => e.exerciseId),
    session._id,
  );

  // The same exercise can appear twice in a session; merge its sets.
  const setsByExercise = new Map<string, { entry: SessionEntry; sets: SessionSet[] }>();
  for (const entry of entries) {
    const key = String(entry.exerciseId);
    const current = setsByExercise.get(key);
    if (current) current.sets.push(...entry.sets);
    else setsByExercise.set(key, { entry, sets: [...entry.sets] });
  }

  const prs: SessionPr[] = [];
  for (const [key, { entry, sets }] of setsByExercise) {
    const types = beatenRecords(
      recordValues(exerciseMetrics(entry.kind, sets)),
      previous.get(key) ?? {},
    );
    if (types.length > 0) prs.push({ exerciseId: key, exerciseName: entry.exerciseName, types });
  }

  session.set("entries", entries);
  session.status = "completed";
  session.finishedAt = new Date();
  await session.save();

  return { session, prs };
};

export const deleteSession = async (id: string, userId: string): Promise<{ id: string }> => {
  const session = await findOwnedSession(id, userId);
  await session.deleteOne();
  return { id };
};

/** Last time's sets for an exercise added mid-session. */
export const suggestionsFor = async (
  userId: string,
  exerciseId: string,
): Promise<{ exerciseId: string; sets: SessionSet[] }> => {
  if (!Types.ObjectId.isValid(exerciseId)) throw new BadRequestError("Invalid exerciseId");
  const id = new Types.ObjectId(exerciseId);
  const sets = (await lastSetsFor(userId, [id])).get(exerciseId) ?? [];
  return { exerciseId, sets };
};
