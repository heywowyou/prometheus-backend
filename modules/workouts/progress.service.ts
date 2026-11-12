import type { Types } from "mongoose";
import { computeStreak, cycleIndex, localDateKey, type Streak } from "../../core/domain";
import { findOwnedExercise } from "./exercise.service";
import Routine from "./routine.model";
import WorkoutSession, { type SessionEntry, type SessionSet } from "./workout-session.model";
import {
  exerciseMetrics,
  mergeRecords,
  recordValues,
  type ExerciseMetrics,
  type PersonalRecords,
} from "./workout.metrics";

type SessionRow = { _id: Types.ObjectId; startedAt: Date; entries: SessionEntry[] };

/** All sets of one exercise within a session (it may appear more than once). */
const setsOf = (session: SessionRow, exerciseId: string): SessionSet[] =>
  session.entries
    .filter((e) => String(e.exerciseId) === exerciseId)
    .flatMap((e) => e.sets);

/**
 * Best values per exercise across completed sessions, leaving out one session
 * (the one being finished) so it can be compared against everything before it.
 */
export const recordsBefore = async (
  userId: string,
  exerciseIds: Types.ObjectId[],
  excludeSessionId: Types.ObjectId,
): Promise<Map<string, PersonalRecords>> => {
  const sessions = await WorkoutSession.find(
    {
      userId,
      status: "completed",
      _id: { $ne: excludeSessionId },
      "entries.exerciseId": { $in: exerciseIds },
    },
    { startedAt: 1, entries: 1 },
  ).lean<SessionRow[]>();

  const records = new Map<string, PersonalRecords>();
  for (const id of exerciseIds.map(String)) {
    let best: PersonalRecords = {};
    for (const session of sessions) {
      const entry = session.entries.find((e) => String(e.exerciseId) === id);
      if (!entry) continue;
      best = mergeRecords(best, recordValues(exerciseMetrics(entry.kind, setsOf(session, id))));
    }
    records.set(id, best);
  }
  return records;
};

export interface ProgressPoint {
  sessionId: string;
  date: string;
  metrics: ExerciseMetrics;
}

export interface ExerciseProgress {
  exercise: { _id: string; name: string; kind: string; muscleGroup?: string };
  /** Oldest first, one point per completed session. */
  points: ProgressPoint[];
  records: PersonalRecords;
}

export const getExerciseProgress = async (
  exerciseId: string,
  userId: string,
): Promise<ExerciseProgress> => {
  const exercise = await findOwnedExercise(exerciseId, userId);
  const sessions = await WorkoutSession.find(
    { userId, status: "completed", "entries.exerciseId": exercise._id },
    { startedAt: 1, entries: 1 },
  )
    .sort({ startedAt: 1 })
    .lean<SessionRow[]>();

  let records: PersonalRecords = {};
  const points = sessions.map((session) => {
    const metrics = exerciseMetrics(exercise.kind, setsOf(session, exerciseId));
    records = mergeRecords(records, recordValues(metrics));
    return {
      sessionId: String(session._id),
      date: session.startedAt.toISOString(),
      metrics,
    };
  });

  return {
    exercise: {
      _id: String(exercise._id),
      name: exercise.name,
      kind: exercise.kind,
      muscleGroup: exercise.muscleGroup,
    },
    points,
    records,
  };
};

export interface WorkoutHistory {
  /** Consecutive Monday-based weeks with at least one workout. */
  streak: Streak;
  /** Completed workouts ever. */
  total: number;
  /** Only days with workouts, keyed in the user's time zone. */
  days: Array<{ date: string; count: number }>;
}

export const getHistory = async (
  userId: string,
  days: number,
  timeZone: string,
  now: Date = new Date(),
): Promise<WorkoutHistory> => {
  const sessions = await WorkoutSession.find(
    { userId, status: "completed" },
    { startedAt: 1 },
  ).lean<Array<{ startedAt: Date }>>();
  const dates = sessions.map((s) => s.startedAt);

  const since = now.getTime() - days * 86_400_000;
  const counts = new Map<string, number>();
  for (const date of dates) {
    if (date.getTime() < since) continue;
    const key = localDateKey(date, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    streak: computeStreak(dates, "weekly", timeZone, now),
    total: dates.length,
    days: [...counts].map(([date, count]) => ({ date, count })),
  };
};

export interface WorkoutSummary {
  active: { _id: string; name: string; startedAt: Date } | null;
  /** Workouts completed this (Monday-based) week, in the user's zone. */
  thisWeek: number;
  streak: Streak;
  lastSession: {
    _id: string;
    name: string;
    startedAt: Date;
    finishedAt?: Date;
    exerciseCount: number;
    setCount: number;
  } | null;
  routines: Array<{ _id: string; name: string; exerciseCount: number }>;
}

/** Everything the Today card shows, in one request. */
export const getSummary = async (
  userId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<WorkoutSummary> => {
  const [active, completed, last, routines] = await Promise.all([
    WorkoutSession.findOne({ userId, status: "in_progress" }, { name: 1, startedAt: 1 }).lean(),
    WorkoutSession.find({ userId, status: "completed" }, { startedAt: 1 }).lean<
      Array<{ startedAt: Date }>
    >(),
    WorkoutSession.findOne({ userId, status: "completed" })
      .sort({ startedAt: -1 })
      .lean<SessionRow & { name: string; finishedAt?: Date }>(),
    Routine.find({ userId }, { name: 1, exercises: 1 }).sort({ order: 1 }).limit(3).lean(),
  ]);

  const dates = completed.map((s) => s.startedAt);
  const week = cycleIndex(now, "weekly", timeZone);

  return {
    active: active
      ? { _id: String(active._id), name: active.name, startedAt: active.startedAt }
      : null,
    thisWeek: dates.filter((d) => cycleIndex(d, "weekly", timeZone) === week).length,
    streak: computeStreak(dates, "weekly", timeZone, now),
    lastSession: last
      ? {
          _id: String(last._id),
          name: last.name,
          startedAt: last.startedAt,
          finishedAt: last.finishedAt,
          exerciseCount: last.entries.length,
          setCount: last.entries.reduce((n, e) => n + e.sets.length, 0),
        }
      : null,
    routines: routines.map((r) => ({
      _id: String(r._id),
      name: r.name,
      exerciseCount: r.exercises.length,
    })),
  };
};
