import { dayKey, parseDay } from './mealplan.js';

/**
 * Logging streaks, computed from the days a user actually logged a meal.
 * Kept DB-free so it can be unit-tested without Postgres; days are the same
 * UTC `YYYY-MM-DD` keys the rest of the API speaks.
 *
 * The forgiveness rule is deliberate. A streak that dies on one missed day
 * punishes exactly the person who needs to come back tomorrow, and in a
 * health app that reliably ends the habit instead of restarting it. So one
 * missed day is forgiven and keeps the run alive; two in a row resets it.
 * Today never counts as a miss — the day is not over yet.
 */

/** How many consecutive missed days end a run. */
const BREAK_AFTER_MISSES = 2;
/** Nobody needs a streak longer than this, and it bounds the backward walk. */
const MAX_LOOKBACK_DAYS = 730;

export interface WeekDay {
  date: string;
  logged: boolean;
}

export interface StreakSummary {
  /** Consecutive logged days ending today (single gaps forgiven). */
  current: number;
  longest: number;
  loggedToday: boolean;
  /** True when the run is only alive because a missed day is being forgiven. */
  forgiving: boolean;
  /** Monday..Sunday of the current week, for the dot row. */
  week: WeekDay[];
}

function shift(day: string, delta: number): string {
  const d = parseDay(day)!;
  d.setUTCDate(d.getUTCDate() + delta);
  return dayKey(d);
}

/** Whole days from `from` to `to`, both UTC day keys. */
function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to)!.getTime() - parseDay(from)!.getTime()) / 86_400_000);
}

/**
 * The run ending today. Walking backward rather than forward means an empty
 * history costs one iteration instead of a scan.
 */
function currentRun(logged: Set<string>, today: string): { count: number; forgiving: boolean } {
  let count = 0;
  let misses = 0;
  let day = today;

  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    if (logged.has(day)) {
      count++;
      misses = 0;
    } else if (i > 0) {
      // i === 0 is today: still in progress, so it can neither extend nor
      // break the run.
      misses++;
      if (misses >= BREAK_AFTER_MISSES) break;
    }
    day = shift(day, -1);
  }
  // The run is being carried by forgiveness only when the gap is at the head:
  // nothing today and nothing yesterday, so tomorrow is the last chance.
  // (`misses` at this point just describes whatever ended the walk.)
  const forgiving = count > 0 && !logged.has(today) && !logged.has(shift(today, -1));
  return { count, forgiving };
}

/** Longest run in the whole history, under the same one-gap forgiveness. */
function longestRun(sortedDays: string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;

  for (const day of sortedDays) {
    // gap 1 = consecutive, gap 2 = exactly one missed day (forgiven).
    run = prev !== null && daysBetween(prev, day) <= 2 ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}

/** Monday..Sunday of the week containing `today`. */
function weekDots(logged: Set<string>, today: string): WeekDay[] {
  const monday = shift(today, -((parseDay(today)!.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = shift(monday, i);
    return { date, logged: logged.has(date) };
  });
}

/**
 * `loggedDays` is every UTC day the user logged a meal, in any order.
 * `today` defaults to the current UTC day.
 */
export function computeStreak(loggedDays: string[], today = dayKey(new Date())): StreakSummary {
  const logged = new Set(loggedDays);
  const { count, forgiving } = currentRun(logged, today);
  return {
    current: count,
    // A run in progress can outgrow anything in the history.
    longest: Math.max(longestRun([...logged].sort()), count),
    loggedToday: logged.has(today),
    forgiving,
    week: weekDots(logged, today),
  };
}
