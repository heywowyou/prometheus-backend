import { cycleIndex, cycleIndexOfKey, type RecurrenceType } from "./recurrence";

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
 * Skipped cycles (`skips`, by their first day `YYYY-MM-DD`) neither break a
 * run nor add to it.
 */
export const computeStreak = (
  completions: Date[],
  type: RecurrenceType,
  timeZone: string,
  now: Date = new Date(),
  skips: readonly string[] = [],
): Streak => {
  if (type === "none" || completions.length === 0) return NO_STREAK;

  const done = new Set(completions.map((d) => cycleIndex(d, type, timeZone)));
  const skipped = new Set(skips.map((key) => cycleIndexOfKey(key, type)));
  const first = Math.min(...done);
  const nowCycle = cycleIndex(now, type, timeZone);

  let best = 0;
  let run = 0;
  for (let cycle = first; cycle <= nowCycle; cycle += 1) {
    if (done.has(cycle)) {
      run += 1;
      best = Math.max(best, run);
    } else if (!skipped.has(cycle) && cycle !== nowCycle) {
      run = 0;
    }
  }

  let current = 0;
  for (let cycle = nowCycle; cycle >= first; cycle -= 1) {
    if (done.has(cycle)) current += 1;
    else if (!skipped.has(cycle) && cycle !== nowCycle) break;
  }
  return { current, best };
};
