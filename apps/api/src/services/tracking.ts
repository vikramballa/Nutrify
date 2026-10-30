import type { Macros, ProgressDay } from '@nutrichef/shared';
import { dayKey, parseDay } from './mealplan.js';

/**
 * Pure date/aggregation math for water, weight and progress tracking, kept
 * DB-free so it can be unit-tested without Postgres. Like the meal planner,
 * days are UTC midnights and the wire format is the `YYYY-MM-DD` day key.
 */

/** Resolve an optional YYYY-MM-DD key to a UTC-midnight Date; null when malformed. */
export function resolveDay(date: string | undefined, now = new Date()): Date | null {
  if (date == null) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  return parseDay(date);
}

export interface DayRange {
  start: Date; // oldest day, UTC midnight
  endExclusive: Date; // tomorrow, UTC midnight
  days: string[]; // day keys, oldest..today
}

/** The last `days` UTC days ending today (inclusive). */
export function dayRange(days: number, now = new Date()): DayRange {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const endExclusive = new Date(today);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const keys = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return dayKey(d);
  });
  return { start, endExclusive, days: keys };
}

interface LogMacros {
  at: Date;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Per-day macro totals from meal logs, mirroring the /logs/today math. */
export function computeDailyTotals(days: string[], logs: LogMacros[]): ProgressDay[] {
  const totals = new Map<string, ProgressDay>(
    days.map((d) => [d, { date: d, calories: 0, protein: 0, carbs: 0, fat: 0 }]),
  );
  for (const l of logs) {
    const t = totals.get(dayKey(l.at));
    if (!t) continue;
    t.calories += l.calories;
    t.protein += l.protein;
    t.carbs += l.carbs;
    t.fat += l.fat;
  }
  return days.map((d) => totals.get(d)!);
}

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const;

/**
 * 0-100 adherence to the user's own targets, averaged over the days that were
 * actually logged. Each macro scores 1 when it lands on target and falls to 0
 * once it is a full target away in either direction, so 1200 kcal against a
 * 2000 goal and 2800 against the same goal are penalised equally.
 *
 * Days with nothing logged are skipped rather than scored 0 — an unlogged day
 * is missing data, not a day of eating nothing. No logged days => 0.
 */
export function adherenceScore(days: ProgressDay[], goals: Macros): number {
  const logged = days.filter((d) => d.calories > 0);
  if (logged.length === 0) return 0;

  const dayScores = logged.map((d) => {
    const parts = MACRO_KEYS.map((k) => {
      const goal = goals[k];
      if (goal <= 0) return 1; // no target set for this macro — don't punish
      return Math.max(0, 1 - Math.abs(d[k] - goal) / goal);
    });
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  });

  const mean = dayScores.reduce((a, b) => a + b, 0) / dayScores.length;
  return Math.round(mean * 100);
}
