import { getUserId } from "../../core/auth";
import {
  asBoolean,
  asDate,
  asEnum,
  asNumber,
  asRequiredString,
  asString,
  asyncHandler,
  getRequestTimeZone,
  supplied,
} from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import { EXERCISE_KINDS, MAX_EXERCISE_NAME, MUSCLE_GROUPS } from "./exercise.model";
import { MAX_REST_SEC, MAX_ROUTINE_EXERCISES, MAX_SETS } from "./routine.model";
import { MAX_SESSION_ENTRIES, MAX_SESSION_SETS } from "./workout-session.model";
import * as ExerciseService from "./exercise.service";
import * as RoutineService from "./routine.service";
import * as SessionService from "./session.service";
import * as ProgressService from "./progress.service";

type Body = Record<string, unknown>;

const bodyOf = (req: { body?: unknown }): Body => (req.body ?? {}) as Body;
const idParam = (req: { params: Record<string, unknown> }): string => String(req.params.id);

const asObject = (value: unknown, field: string): Body => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an object`);
  }
  return value as Body;
};

const asArray = (value: unknown, field: string, max: number): unknown[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new BadRequestError(`${field} must be an array`);
  if (value.length > max) throw new BadRequestError(`${field} can hold at most ${max} items`);
  return value;
};

// Generous ceilings that still reject typos like 1000 kg or 10 000 reps.
const REPS = { min: 0, max: 1000, integer: true };
const WEIGHT_KG = { min: 0, max: 1000 };
const DURATION_SEC = { min: 0, max: 24 * 3600, integer: true };
const DISTANCE_M = { min: 0, max: 1_000_000 };
const REST_SEC = { min: 0, max: MAX_REST_SEC, integer: true };

const asId = (value: unknown, field: string): string =>
  asRequiredString(value, field, { maxLength: 40 });

const parseIds = (value: unknown): string[] => {
  const raw = asArray(value, "ids", 500);
  if (!raw || raw.length === 0) throw new BadRequestError("ids must be a non-empty array");
  const ids = raw.map((id, i) => asId(id, `ids[${i}]`));
  if (new Set(ids).size !== ids.length) throw new BadRequestError("ids must be unique");
  return ids;
};

// ---- Exercises ------------------------------------------------------------

const parseExercise = (b: Body): ExerciseService.ExerciseInput => ({
  name: asString(b.name, "name", { maxLength: MAX_EXERCISE_NAME }),
  kind: asEnum(b.kind, "kind", EXERCISE_KINDS),
  muscleGroup:
    supplied(b, "muscleGroup") && (b.muscleGroup === null || b.muscleGroup === "")
      ? null
      : asEnum(b.muscleGroup, "muscleGroup", MUSCLE_GROUPS),
  notes: asString(b.notes, "notes", { maxLength: 1000 }),
  archived: asBoolean(b.archived, "archived"),
});

export const listExercises = asyncHandler(async (req, res) => {
  const archived = asBoolean(req.query.archived, "archived");
  res.status(200).json(await ExerciseService.listExercises(getUserId(req), { archived }));
});

export const createExercise = asyncHandler(async (req, res) => {
  const exercise = await ExerciseService.createExercise(parseExercise(bodyOf(req)), getUserId(req));
  res.status(201).json(exercise);
});

export const updateExercise = asyncHandler(async (req, res) => {
  const exercise = await ExerciseService.updateExercise(
    idParam(req),
    getUserId(req),
    parseExercise(bodyOf(req)),
  );
  res.status(200).json(exercise);
});

export const deleteExercise = asyncHandler(async (req, res) => {
  res.status(200).json(await ExerciseService.deleteExercise(idParam(req), getUserId(req)));
});

export const getExerciseProgress = asyncHandler(async (req, res) => {
  res.status(200).json(await ProgressService.getExerciseProgress(idParam(req), getUserId(req)));
});

export const getLastSets = asyncHandler(async (req, res) => {
  res.status(200).json(await SessionService.suggestionsFor(getUserId(req), idParam(req)));
});

// ---- Routines -------------------------------------------------------------

const parseRoutineExercises = (
  value: unknown,
): RoutineService.RoutineExerciseInput[] | undefined =>
  asArray(value, "exercises", MAX_ROUTINE_EXERCISES)?.map((raw, i) => {
    const e = asObject(raw, `exercises[${i}]`);
    const field = (name: string) => `exercises[${i}].${name}`;
    return {
      exerciseId: asId(e.exerciseId, field("exerciseId")),
      sets: asNumber(e.sets, field("sets"), { min: 1, max: MAX_SETS, integer: true }) ?? 3,
      targetReps: asNumber(e.targetReps, field("targetReps"), REPS),
      targetWeightKg: asNumber(e.targetWeightKg, field("targetWeightKg"), WEIGHT_KG),
      targetDurationSec: asNumber(e.targetDurationSec, field("targetDurationSec"), DURATION_SEC),
      targetDistanceM: asNumber(e.targetDistanceM, field("targetDistanceM"), DISTANCE_M),
      restSec: asNumber(e.restSec, field("restSec"), REST_SEC),
    };
  });

const parseRoutine = (b: Body): RoutineService.RoutineInput => ({
  name: asString(b.name, "name", { maxLength: 80 }),
  notes: asString(b.notes, "notes", { maxLength: 1000 }),
  exercises: parseRoutineExercises(b.exercises),
});

export const listRoutines = asyncHandler(async (req, res) => {
  res.status(200).json(await RoutineService.listRoutines(getUserId(req)));
});

export const getRoutine = asyncHandler(async (req, res) => {
  res.status(200).json(await RoutineService.getRoutine(idParam(req), getUserId(req)));
});

export const createRoutine = asyncHandler(async (req, res) => {
  const routine = await RoutineService.createRoutine(parseRoutine(bodyOf(req)), getUserId(req));
  res.status(201).json(routine);
});

export const updateRoutine = asyncHandler(async (req, res) => {
  const routine = await RoutineService.updateRoutine(
    idParam(req),
    getUserId(req),
    parseRoutine(bodyOf(req)),
  );
  res.status(200).json(routine);
});

export const reorderRoutines = asyncHandler(async (req, res) => {
  await RoutineService.reorderRoutines(getUserId(req), parseIds(bodyOf(req).ids));
  res.status(204).send();
});

export const deleteRoutine = asyncHandler(async (req, res) => {
  res.status(200).json(await RoutineService.deleteRoutine(idParam(req), getUserId(req)));
});

// ---- Sessions -------------------------------------------------------------

const parseEntries = (value: unknown): SessionService.SessionEntryInput[] | undefined =>
  asArray(value, "entries", MAX_SESSION_ENTRIES)?.map((raw, i) => {
    const e = asObject(raw, `entries[${i}]`);
    const sets = asArray(e.sets, `entries[${i}].sets`, MAX_SESSION_SETS) ?? [];
    return {
      exerciseId: asId(e.exerciseId, `entries[${i}].exerciseId`),
      restSec: asNumber(e.restSec, `entries[${i}].restSec`, REST_SEC),
      sets: sets.map((rawSet, j) => {
        const s = asObject(rawSet, `entries[${i}].sets[${j}]`);
        const field = (name: string) => `entries[${i}].sets[${j}].${name}`;
        return {
          reps: asNumber(s.reps, field("reps"), REPS),
          weightKg: asNumber(s.weightKg, field("weightKg"), WEIGHT_KG),
          durationSec: asNumber(s.durationSec, field("durationSec"), DURATION_SEC),
          distanceM: asNumber(s.distanceM, field("distanceM"), DISTANCE_M),
          done: asBoolean(s.done, field("done")) ?? false,
        };
      }),
    };
  });

export const getActiveSession = asyncHandler(async (req, res) => {
  res.status(200).json(await SessionService.getActiveSession(getUserId(req)));
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await SessionService.listSessions(getUserId(req), {
    before: asDate(req.query.before, "before"),
    limit: asNumber(req.query.limit, "limit", { min: 1, max: 50, integer: true }) ?? 20,
  });
  res.status(200).json(sessions);
});

export const startSession = asyncHandler(async (req, res) => {
  const routineId = asString(bodyOf(req).routineId, "routineId", { maxLength: 40 }) || undefined;
  res.status(201).json(await SessionService.startSession(getUserId(req), routineId));
});

export const getSession = asyncHandler(async (req, res) => {
  res.status(200).json(await SessionService.getSession(idParam(req), getUserId(req)));
});

export const updateSession = asyncHandler(async (req, res) => {
  const b = bodyOf(req);
  const session = await SessionService.updateSession(idParam(req), getUserId(req), {
    name: asString(b.name, "name", { maxLength: 80 }),
    notes: asString(b.notes, "notes", { maxLength: 2000 }),
    startedAt: asDate(b.startedAt, "startedAt"),
    finishedAt: asDate(b.finishedAt, "finishedAt"),
    entries: parseEntries(b.entries),
  });
  res.status(200).json(session);
});

export const finishSession = asyncHandler(async (req, res) => {
  res.status(200).json(await SessionService.finishSession(idParam(req), getUserId(req)));
});

export const deleteSession = asyncHandler(async (req, res) => {
  res.status(200).json(await SessionService.deleteSession(idParam(req), getUserId(req)));
});

// ---- Stats ----------------------------------------------------------------

export const getHistory = asyncHandler(async (req, res) => {
  const days = asNumber(req.query.days, "days", { min: 7, max: 730, integer: true }) ?? 182;
  res
    .status(200)
    .json(await ProgressService.getHistory(getUserId(req), days, getRequestTimeZone(req)));
});

export const getSummary = asyncHandler(async (req, res) => {
  res.status(200).json(await ProgressService.getSummary(getUserId(req), getRequestTimeZone(req)));
});
