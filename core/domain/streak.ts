import { cycleIndex, type RecurrenceType } from "./recurrence";

export interface Streak {
  /** Consecutive cycles completed, up to this one (or the last, if this one is still open). */
  current: number;
  /** Longest run ever. */
  best: number;
}

const NO_STREAK: Streak = { current: 0, best: 0 };

/**
 * Streaks from completion timestamps, counted in recurrence cycles (days,
 * Monday-based weeks or months) in the user's time zone.
 *
 * The current cycle being still open doesn't break a streak: a daily habit
 * done yesterday but not yet today keeps its streak until today ends.
 */
export const computeStreak = (
  completions: Date[],
  type: RecurrenceType,
  timeZone: string,
  now: Date = new Date(),
): Streak => {
  if (type === "none" || completions.length === 0) return NO_STREAK;

  const cycles = [...new Set(completions.map((d) => cycleIndex(d, type, timeZone)))].sort(
    (a, b) => a - b,
  );

  let best = 1;
  let run = 1;
  for (let i = 1; i < cycles.length; i += 1) {
    run = cycles[i] === (cycles[i - 1] as number) + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const last = cycles[cycles.length - 1] as number;
  if (last < cycleIndex(now, type, timeZone) - 1) return { current: 0, best };

  let current = 1;
  for (let i = cycles.length - 2; i >= 0; i -= 1) {
    if (cycles[i] !== (cycles[i + 1] as number) - 1) break;
    current += 1;
  }
  return { current, best };
};
