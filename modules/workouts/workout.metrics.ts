import type { ExerciseKind } from "./exercise.model";
import type { SessionSet } from "./workout-session.model";

/**
 * Pure per-exercise metrics for one session's sets. Shared by the progress
 * endpoint and personal-record detection when a session is finished.
 */

export interface StrengthMetrics {
  kind: "strength";
  /** Heaviest weight lifted for at least one rep. */
  bestWeightKg: number;
  /** Best estimated one-rep max (Epley), over all sets. */
  e1rmKg: number;
  /** The set behind `e1rmKg` (or the most reps, for bodyweight work). */
  bestSet: { reps: number; weightKg: number } | null;
  /** Σ reps × weight. */
  volumeKg: number;
  /** Most reps in one set: the measure for bodyweight exercises. */
  maxReps: number;
}

export interface CardioMetrics {
  kind: "cardio";
  distanceM: number;
  durationSec: number;
  /** Seconds per km; null without both distance and duration. */
  paceSecPerKm: number | null;
}

export type ExerciseMetrics = StrengthMetrics | CardioMetrics;

/** Epley: weight × (1 + reps / 30); a single is its own max. */
export const estimateOneRepMax = (weightKg: number, reps: number): number =>
  reps <= 0 || weightKg <= 0 ? 0 : reps === 1 ? weightKg : weightKg * (1 + reps / 30);

/** One decimal place, without float noise (93.3, not 93.30000000000001). */
const round = (value: number): number => Math.round(value * 10) / 10;

export const strengthMetrics = (sets: SessionSet[]): StrengthMetrics => {
  const metrics: StrengthMetrics = {
    kind: "strength",
    bestWeightKg: 0,
    e1rmKg: 0,
    bestSet: null,
    volumeKg: 0,
    maxReps: 0,
  };
  let bestScore = -1;

  for (const set of sets) {
    const reps = set.reps ?? 0;
    if (!set.done || reps <= 0) continue;
    const weightKg = set.weightKg ?? 0;
    const e1rm = estimateOneRepMax(weightKg, reps);

    metrics.bestWeightKg = Math.max(metrics.bestWeightKg, weightKg);
    metrics.e1rmKg = Math.max(metrics.e1rmKg, e1rm);
    metrics.volumeKg += weightKg * reps;
    metrics.maxReps = Math.max(metrics.maxReps, reps);

    // Weighted sets rank by e1RM; bodyweight sets by reps.
    const score = e1rm > 0 ? 1_000_000 + e1rm : reps;
    if (score > bestScore) {
      bestScore = score;
      metrics.bestSet = { reps, weightKg };
    }
  }

  metrics.e1rmKg = round(metrics.e1rmKg);
  metrics.volumeKg = round(metrics.volumeKg);
  return metrics;
};

export const cardioMetrics = (sets: SessionSet[]): CardioMetrics => {
  let distanceM = 0;
  let durationSec = 0;
  for (const set of sets) {
    if (!set.done) continue;
    distanceM += set.distanceM ?? 0;
    durationSec += set.durationSec ?? 0;
  }
  return {
    kind: "cardio",
    distanceM,
    durationSec,
    paceSecPerKm:
      distanceM > 0 && durationSec > 0 ? Math.round(durationSec / (distanceM / 1000)) : null,
  };
};

export const exerciseMetrics = (kind: ExerciseKind, sets: SessionSet[]): ExerciseMetrics =>
  kind === "strength" ? strengthMetrics(sets) : cardioMetrics(sets);

/** Record types; pace is the only one where lower is better. */
export const PR_TYPES = [
  "weight",
  "e1rm",
  "volume",
  "reps",
  "distance",
  "duration",
  "pace",
] as const;
export type PrType = (typeof PR_TYPES)[number];

export type PersonalRecords = Partial<Record<PrType, number>>;

/** The comparable numbers from one session's metrics; zeros are left out. */
export const recordValues = (m: ExerciseMetrics): PersonalRecords => {
  const values: PersonalRecords = {};
  if (m.kind === "strength") {
    if (m.bestWeightKg > 0) values.weight = m.bestWeightKg;
    if (m.e1rmKg > 0) values.e1rm = m.e1rmKg;
    if (m.volumeKg > 0) values.volume = m.volumeKg;
    // Reps only matter on their own for bodyweight work.
    if (m.bestWeightKg === 0 && m.maxReps > 0) values.reps = m.maxReps;
  } else {
    if (m.distanceM > 0) values.distance = m.distanceM;
    if (m.durationSec > 0) values.duration = m.durationSec;
    if (m.paceSecPerKm !== null) values.pace = m.paceSecPerKm;
  }
  return values;
};

const isBetter = (type: PrType, value: number, best: number | undefined): boolean =>
  best === undefined || (type === "pace" ? value < best : value > best);

/** Folds one session's values into the running bests. */
export const mergeRecords = (best: PersonalRecords, values: PersonalRecords): PersonalRecords => {
  const next = { ...best };
  for (const type of PR_TYPES) {
    const value = values[type];
    if (value !== undefined && isBetter(type, value, next[type])) next[type] = value;
  }
  return next;
};

/** Types where `values` beats `previous`. A first-ever session sets no records. */
export const beatenRecords = (values: PersonalRecords, previous: PersonalRecords): PrType[] => {
  if (Object.keys(previous).length === 0) return [];
  return PR_TYPES.filter((type) => {
    const value = values[type];
    return value !== undefined && previous[type] !== undefined && isBetter(type, value, previous[type]);
  });
};
