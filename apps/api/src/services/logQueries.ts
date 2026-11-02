import type { MealLog } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Meal-log reads that Postgres answers better than JavaScript: totals per day
 * and "distinct" questions. Fetching every row of a 90-day window (up to 5000)
 * just to add four numbers per day moved far more data than the answer holds;
 * these return at most one row per day, or one per dish.
 *
 * `at` is stored as UTC (timestamp without time zone), so date_trunc('day')
 * gives the same UTC days as dayKey() and dayRange() in tracking.ts.
 */

/** Macro totals for one UTC day. `at` is that day's midnight (UTC). */
export interface DayMacros {
  at: Date;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * One row per day that has logs in [start, endExclusive), totals summed.
 * Shaped like a meal log, so computeDailyTotals() takes it unchanged.
 */
export async function dailyMacroTotals(userId: string, start: Date, endExclusive: Date): Promise<DayMacros[]> {
  return prisma.$queryRaw<DayMacros[]>`
    SELECT date_trunc('day', "at")  AS "at",
           SUM("calories")::int     AS "calories",
           SUM("protein")::int      AS "protein",
           SUM("carbs")::int        AS "carbs",
           SUM("fat")::int          AS "fat"
    FROM "MealLog"
    WHERE "userId" = ${userId} AND "at" >= ${start} AND "at" < ${endExclusive}
    GROUP BY 1
    ORDER BY 1
  `;
}

/** The distinct UTC days since `since` on which the user logged anything. */
export async function loggedDays(userId: string, since: Date): Promise<Date[]> {
  const rows = await prisma.$queryRaw<{ day: Date }[]>`
    SELECT DISTINCT date_trunc('day', "at") AS "day"
    FROM "MealLog"
    WHERE "userId" = ${userId} AND "at" >= ${since}
    ORDER BY 1
  `;
  return rows.map((r) => r.day);
}

/**
 * The user's most recently eaten dishes: the newest log per dish name, newest
 * dish first. Served by MealLog (userId, name, at DESC).
 *
 * The previous version sorted by name before its 50-row cap, so a user with
 * more than 50 dishes in the window lost their newest meals to alphabetically
 * earlier ones.
 */
export async function recentDistinctMeals(userId: string, since: Date, limit: number): Promise<MealLog[]> {
  return prisma.$queryRaw<MealLog[]>`
    SELECT * FROM (
      SELECT DISTINCT ON ("name") *
      FROM "MealLog"
      WHERE "userId" = ${userId} AND "at" >= ${since}
      ORDER BY "name", "at" DESC
    ) AS newest
    ORDER BY "at" DESC
    LIMIT ${limit}
  `;
}
